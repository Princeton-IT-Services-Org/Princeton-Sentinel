CREATE MATERIALIZED VIEW IF NOT EXISTS mv_msgraph_inventory_summary AS
SELECT
  1 AS summary_id,
  (SELECT COUNT(*) FROM msgraph_users) AS users_total,
  (SELECT COUNT(*) FROM msgraph_users WHERE deleted_at IS NOT NULL) AS users_deleted,
  (SELECT MAX(synced_at) FROM msgraph_users) AS users_last_synced_at,
  (SELECT COUNT(*) FROM msgraph_groups) AS groups_total,
  (SELECT COUNT(*) FROM msgraph_groups WHERE deleted_at IS NOT NULL) AS groups_deleted,
  (SELECT MAX(synced_at) FROM msgraph_groups) AS groups_last_synced_at,
  (SELECT COUNT(*) FROM msgraph_sites) AS sites_total,
  (SELECT COUNT(*) FROM msgraph_sites WHERE deleted_at IS NOT NULL) AS sites_deleted,
  (SELECT MAX(synced_at) FROM msgraph_sites) AS sites_last_synced_at,
  (SELECT COUNT(*) FROM msgraph_drives) AS drives_total,
  (SELECT COUNT(*) FROM msgraph_drives WHERE deleted_at IS NOT NULL) AS drives_deleted,
  (SELECT MAX(synced_at) FROM msgraph_drives) AS drives_last_synced_at,
  (SELECT COUNT(*) FROM msgraph_drive_items) AS drive_items_total,
  (SELECT COUNT(*) FROM msgraph_drive_items WHERE deleted_at IS NOT NULL) AS drive_items_deleted,
  (SELECT MAX(synced_at) FROM msgraph_drive_items) AS drive_items_last_synced_at;

CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_inventory_summary_uidx
ON mv_msgraph_inventory_summary (summary_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_msgraph_sharing_posture_summary AS
SELECT
  1 AS summary_id,
  (SELECT COUNT(*) FROM msgraph_drive_item_permissions) AS permissions_total,
  (SELECT COUNT(DISTINCT (drive_id, item_id)) FROM msgraph_drive_item_permissions) AS items_with_permissions,
  (SELECT COUNT(*) FROM msgraph_drive_item_permissions WHERE link_scope = 'anonymous') AS anonymous_links,
  (SELECT COUNT(*) FROM msgraph_drive_item_permissions WHERE link_scope = 'organization') AS organization_links,
  (SELECT COUNT(*) FROM msgraph_drive_item_permissions WHERE link_scope = 'users') AS users_links,
  (SELECT COUNT(*) FROM msgraph_drive_item_permissions WHERE link_type IS NULL) AS direct_shares,
  (SELECT COUNT(*) FROM msgraph_drive_item_permission_grants WHERE principal_type = 'guest') AS guest_grants;

CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_sharing_posture_summary_uidx
ON mv_msgraph_sharing_posture_summary (summary_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_latest_job_runs AS
SELECT DISTINCT ON (job_id)
  job_id,
  run_id,
  started_at,
  finished_at,
  status,
  error
FROM job_runs
ORDER BY job_id, started_at DESC NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS mv_latest_job_runs_uidx
ON mv_latest_job_runs (job_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_msgraph_site_inventory AS
WITH sharepoint_sites AS (
  SELECT
    s.id AS site_id,
    'site' AS source_type,
    s.name AS title,
    s.web_url,
    s.created_dt,
    s.raw_json,
    false AS is_personal
  FROM msgraph_sites s
  WHERE s.deleted_at IS NULL
),
personal_sites AS (
  SELECT
    d.id AS site_id,
    'drive' AS source_type,
    d.name AS title,
    d.web_url,
    d.created_dt,
    NULL::jsonb AS raw_json,
    true AS is_personal
  FROM msgraph_drives d
  WHERE d.deleted_at IS NULL AND d.site_id IS NULL
),
base AS (
  SELECT * FROM sharepoint_sites
  UNION ALL
  SELECT * FROM personal_sites
),
drive_stats AS (
  SELECT d.site_id, COUNT(*) AS drive_count, SUM(d.quota_used) AS storage_used, SUM(d.quota_total) AS storage_total
  FROM msgraph_drives d
  WHERE d.deleted_at IS NULL AND d.site_id IS NOT NULL
  GROUP BY d.site_id
),
personal_drive_stats AS (
  SELECT d.id AS site_id, 1 AS drive_count, d.quota_used AS storage_used, d.quota_total AS storage_total
  FROM msgraph_drives d
  WHERE d.deleted_at IS NULL AND d.site_id IS NULL
),
last_write AS (
  SELECT d.site_id, MAX(i.modified_dt) AS last_write_dt
  FROM msgraph_drive_items i
  JOIN msgraph_drives d ON d.id = i.drive_id
  WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NOT NULL
  GROUP BY d.site_id
),
last_write_personal AS (
  SELECT i.drive_id AS site_id, MAX(i.modified_dt) AS last_write_dt
  FROM msgraph_drive_items i
  JOIN msgraph_drives d ON d.id = i.drive_id
  WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NULL
  GROUP BY i.drive_id
),
last_share AS (
  SELECT d.site_id, MAX(p.synced_at) AS last_share_dt
  FROM msgraph_drive_item_permissions p
  JOIN msgraph_drives d ON d.id = p.drive_id
  WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NOT NULL AND p.link_scope IS NOT NULL
  GROUP BY d.site_id
),
last_share_personal AS (
  SELECT p.drive_id AS site_id, MAX(p.synced_at) AS last_share_dt
  FROM msgraph_drive_item_permissions p
  JOIN msgraph_drives d ON d.id = p.drive_id
  WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NULL AND p.link_scope IS NOT NULL
  GROUP BY p.drive_id
)
SELECT
  CASE WHEN b.is_personal THEN 'drive:' || b.site_id ELSE b.site_id END AS site_key,
  b.site_id,
  b.source_type,
  b.title,
  b.web_url,
  b.created_dt,
  b.is_personal,
  b.raw_json->>'webTemplate' AS template,
  COALESCE(ds.drive_count, pds.drive_count, 0) AS drive_count,
  COALESCE(ds.storage_used, pds.storage_used, 0) AS storage_used_bytes,
  COALESCE(ds.storage_total, pds.storage_total, 0) AS storage_total_bytes,
  COALESCE(lw.last_write_dt, lwp.last_write_dt) AS last_write_dt,
  COALESCE(ls.last_share_dt, lsp.last_share_dt) AS last_share_dt,
  GREATEST(COALESCE(lw.last_write_dt, lwp.last_write_dt), COALESCE(ls.last_share_dt, lsp.last_share_dt)) AS last_activity_dt
FROM base b
LEFT JOIN drive_stats ds ON ds.site_id = b.site_id AND b.is_personal = false
LEFT JOIN personal_drive_stats pds ON pds.site_id = b.site_id AND b.is_personal = true
LEFT JOIN last_write lw ON lw.site_id = b.site_id AND b.is_personal = false
LEFT JOIN last_write_personal lwp ON lwp.site_id = b.site_id AND b.is_personal = true
LEFT JOIN last_share ls ON ls.site_id = b.site_id AND b.is_personal = false
LEFT JOIN last_share_personal lsp ON lsp.site_id = b.site_id AND b.is_personal = true;

CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_site_inventory_uidx
ON mv_msgraph_site_inventory (site_key);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_msgraph_site_sharing_summary AS
WITH base AS (
  SELECT s.id AS site_id, false AS is_personal
  FROM msgraph_sites s
  WHERE s.deleted_at IS NULL
  UNION ALL
  SELECT d.id AS site_id, true AS is_personal
  FROM msgraph_drives d
  WHERE d.deleted_at IS NULL AND d.site_id IS NULL
),
sharepoint_links AS (
  SELECT
    d.site_id AS site_id,
    COUNT(*) FILTER (WHERE p.link_scope IS NOT NULL) AS sharing_links,
    COUNT(*) FILTER (WHERE p.link_scope = 'anonymous') AS anonymous_links,
    COUNT(*) FILTER (WHERE p.link_scope = 'organization') AS organization_links,
    COUNT(*) FILTER (WHERE p.link_scope = 'users') AS users_links,
    COUNT(*) FILTER (WHERE p.link_type IS NULL) AS direct_shares,
    MAX(p.synced_at) AS last_shared_at
  FROM msgraph_drive_item_permissions p
  JOIN msgraph_drives d ON d.id = p.drive_id
  WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NOT NULL
  GROUP BY d.site_id
),
personal_links AS (
  SELECT
    p.drive_id AS site_id,
    COUNT(*) FILTER (WHERE p.link_scope IS NOT NULL) AS sharing_links,
    COUNT(*) FILTER (WHERE p.link_scope = 'anonymous') AS anonymous_links,
    COUNT(*) FILTER (WHERE p.link_scope = 'organization') AS organization_links,
    COUNT(*) FILTER (WHERE p.link_scope = 'users') AS users_links,
    COUNT(*) FILTER (WHERE p.link_type IS NULL) AS direct_shares,
    MAX(p.synced_at) AS last_shared_at
  FROM msgraph_drive_item_permissions p
  JOIN msgraph_drives d ON d.id = p.drive_id
  WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NULL
  GROUP BY p.drive_id
)
SELECT
  CASE WHEN b.is_personal THEN 'drive:' || b.site_id ELSE b.site_id END AS site_key,
  b.site_id,
  b.is_personal,
  COALESCE(s.sharing_links, pl.sharing_links, 0) AS sharing_links,
  COALESCE(s.anonymous_links, pl.anonymous_links, 0) AS anonymous_links,
  COALESCE(s.organization_links, pl.organization_links, 0) AS organization_links,
  COALESCE(s.users_links, pl.users_links, 0) AS users_links,
  COALESCE(s.direct_shares, pl.direct_shares, 0) AS direct_shares,
  COALESCE(s.last_shared_at, pl.last_shared_at) AS last_shared_at
FROM base b
LEFT JOIN sharepoint_links s ON s.site_id = b.site_id AND b.is_personal = false
LEFT JOIN personal_links pl ON pl.site_id = b.site_id AND b.is_personal = true;

CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_site_sharing_summary_uidx
ON mv_msgraph_site_sharing_summary (site_key);

CREATE UNIQUE INDEX IF NOT EXISTS mv_dependencies_uidx
ON mv_dependencies (mv_name, table_name);

INSERT INTO mv_dependencies (mv_name, table_name) VALUES
  ('mv_msgraph_inventory_summary', 'msgraph_users'),
  ('mv_msgraph_inventory_summary', 'msgraph_groups'),
  ('mv_msgraph_inventory_summary', 'msgraph_sites'),
  ('mv_msgraph_inventory_summary', 'msgraph_drives'),
  ('mv_msgraph_inventory_summary', 'msgraph_drive_items'),
  ('mv_msgraph_sharing_posture_summary', 'msgraph_drive_item_permissions'),
  ('mv_msgraph_sharing_posture_summary', 'msgraph_drive_item_permission_grants'),
  ('mv_latest_job_runs', 'job_runs'),
  ('mv_msgraph_site_inventory', 'msgraph_sites'),
  ('mv_msgraph_site_inventory', 'msgraph_drives'),
  ('mv_msgraph_site_inventory', 'msgraph_drive_items'),
  ('mv_msgraph_site_inventory', 'msgraph_drive_item_permissions'),
  ('mv_msgraph_site_sharing_summary', 'msgraph_sites'),
  ('mv_msgraph_site_sharing_summary', 'msgraph_drives'),
  ('mv_msgraph_site_sharing_summary', 'msgraph_drive_item_permissions')
ON CONFLICT DO NOTHING;
