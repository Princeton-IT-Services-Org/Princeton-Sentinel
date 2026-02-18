-- Dashboard DB performance optimizations:
-- - queue-based MV invalidation
-- - targeted base-table indexes
-- - routable/external principal materialized views
-- - mv_refresh worker job seed + 5-minute schedule

CREATE TABLE IF NOT EXISTS mv_refresh_queue (
  mv_name text PRIMARY KEY,
  dirty_since timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  attempts int NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION refresh_impacted_mvs() RETURNS trigger AS $$
DECLARE
  mv record;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  FOR mv IN SELECT DISTINCT mv_name FROM mv_dependencies WHERE table_name = TG_TABLE_NAME LOOP
    INSERT INTO mv_refresh_queue (mv_name, dirty_since)
    VALUES (mv.mv_name, now())
    ON CONFLICT (mv_name) DO NOTHING;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_drives_site_rank
ON msgraph_drives (site_id, drive_type, created_dt, id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drive_items_drive_modified
ON msgraph_drive_items (drive_id, modified_dt DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drive_items_drive_modified_user
ON msgraph_drive_items (drive_id, modified_dt DESC, last_modified_by_user_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drive_item_permissions_drive_synced
ON msgraph_drive_item_permissions (drive_id, synced_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_drive_item_permissions_scope_synced
ON msgraph_drive_item_permissions (link_scope, synced_at DESC)
WHERE deleted_at IS NULL AND link_scope IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drive_item_permission_grants_active_item
ON msgraph_drive_item_permission_grants (drive_id, item_id)
WHERE deleted_at IS NULL;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_msgraph_routable_site_drives AS
WITH sharepoint_drive_ranked AS (
  SELECT
    d.site_id,
    d.id AS route_drive_id,
    d.drive_type,
    d.created_dt,
    ROW_NUMBER() OVER (
      PARTITION BY d.site_id
      ORDER BY
        CASE WHEN d.drive_type = 'documentLibrary' THEN 0 ELSE 1 END,
        d.created_dt ASC NULLS LAST,
        d.id ASC
    ) AS rank_in_site
  FROM msgraph_drives d
  WHERE d.deleted_at IS NULL AND d.site_id IS NOT NULL
),
sharepoint_route_drives AS (
  SELECT site_id, route_drive_id
  FROM sharepoint_drive_ranked
  WHERE rank_in_site = 1
),
sharepoint_route_drive_meta AS (
  SELECT d.site_id, d.id AS route_drive_id, d.web_url AS route_drive_web_url, d.created_dt AS route_drive_created_dt
  FROM msgraph_drives d
  JOIN sharepoint_route_drives srd ON srd.route_drive_id = d.id
  WHERE d.deleted_at IS NULL
),
sharepoint_drive_stats AS (
  SELECT
    d.site_id,
    COUNT(*)::int AS drive_count,
    SUM(d.quota_used) AS storage_used_bytes,
    SUM(d.quota_total) AS storage_total_bytes
  FROM msgraph_drives d
  WHERE d.deleted_at IS NULL AND d.site_id IS NOT NULL
  GROUP BY d.site_id
),
sharepoint_last_write AS (
  SELECT d.site_id, MAX(i.modified_dt) AS last_write_dt
  FROM msgraph_drive_items i
  JOIN msgraph_drives d ON d.id = i.drive_id
  WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NOT NULL
  GROUP BY d.site_id
),
sharepoint_last_share AS (
  SELECT d.site_id, MAX(p.synced_at) AS last_share_dt
  FROM msgraph_drive_item_permissions p
  JOIN msgraph_drives d ON d.id = p.drive_id
  WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND d.site_id IS NOT NULL AND p.link_scope IS NOT NULL
  GROUP BY d.site_id
),
sharepoint_rows AS (
  SELECT
    srd.site_id AS site_key,
    srd.site_id,
    srd.route_drive_id,
    COALESCE(NULLIF(trim(s.name), ''), NULLIF(trim(s.raw_json->>'displayName'), ''), NULLIF(trim(s.raw_json->>'name'), ''), srd.site_id) AS title,
    COALESCE(s.web_url, rdm.route_drive_web_url) AS web_url,
    COALESCE(s.created_dt, rdm.route_drive_created_dt) AS created_dt,
    false AS is_personal,
    s.raw_json->>'webTemplate' AS template,
    COALESCE(ds.drive_count, 0) AS drive_count,
    COALESCE(ds.storage_used_bytes, 0) AS storage_used_bytes,
    COALESCE(ds.storage_total_bytes, 0) AS storage_total_bytes,
    lw.last_write_dt,
    ls.last_share_dt,
    GREATEST(lw.last_write_dt, ls.last_share_dt) AS last_activity_dt
  FROM sharepoint_route_drives srd
  LEFT JOIN msgraph_sites s ON s.id = srd.site_id AND s.deleted_at IS NULL
  LEFT JOIN sharepoint_route_drive_meta rdm ON rdm.route_drive_id = srd.route_drive_id
  LEFT JOIN sharepoint_drive_stats ds ON ds.site_id = srd.site_id
  LEFT JOIN sharepoint_last_write lw ON lw.site_id = srd.site_id
  LEFT JOIN sharepoint_last_share ls ON ls.site_id = srd.site_id
),
personal_last_write AS (
  SELECT i.drive_id, MAX(i.modified_dt) AS last_write_dt
  FROM msgraph_drive_items i
  WHERE i.deleted_at IS NULL
  GROUP BY i.drive_id
),
personal_last_share AS (
  SELECT p.drive_id, MAX(p.synced_at) AS last_share_dt
  FROM msgraph_drive_item_permissions p
  WHERE p.deleted_at IS NULL AND p.link_scope IS NOT NULL
  GROUP BY p.drive_id
),
personal_rows AS (
  SELECT
    'drive:' || d.id AS site_key,
    d.id AS site_id,
    d.id AS route_drive_id,
    COALESCE(u.display_name, d.owner_display_name, d.owner_email, d.name, d.id) AS title,
    d.web_url,
    d.created_dt,
    true AS is_personal,
    NULL::text AS template,
    1::int AS drive_count,
    COALESCE(d.quota_used, 0) AS storage_used_bytes,
    COALESCE(d.quota_total, 0) AS storage_total_bytes,
    lw.last_write_dt,
    ls.last_share_dt,
    GREATEST(lw.last_write_dt, ls.last_share_dt) AS last_activity_dt
  FROM msgraph_drives d
  LEFT JOIN msgraph_users u ON u.id = d.owner_id AND u.deleted_at IS NULL
  LEFT JOIN personal_last_write lw ON lw.drive_id = d.id
  LEFT JOIN personal_last_share ls ON ls.drive_id = d.id
  WHERE d.deleted_at IS NULL AND d.site_id IS NULL
)
SELECT * FROM sharepoint_rows
UNION ALL
SELECT * FROM personal_rows;

CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_routable_site_drives_uidx
ON mv_msgraph_routable_site_drives (site_key);

CREATE INDEX IF NOT EXISTS mv_msgraph_routable_site_drives_last_activity_idx
ON mv_msgraph_routable_site_drives (last_activity_dt DESC, site_key);

CREATE INDEX IF NOT EXISTS mv_msgraph_routable_site_drives_created_idx
ON mv_msgraph_routable_site_drives (created_dt DESC, site_key);

CREATE INDEX IF NOT EXISTS mv_msgraph_routable_site_drives_storage_idx
ON mv_msgraph_routable_site_drives (storage_used_bytes DESC, site_key);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_msgraph_site_external_principals AS
WITH grants AS (
  SELECT
    CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
    LOWER(COALESCE(g.principal_email, g.principal_user_principal_name)) AS email,
    g.synced_at
  FROM msgraph_drive_item_permission_grants g
  JOIN msgraph_drive_item_permissions p
    ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
  JOIN msgraph_drives d ON d.id = p.drive_id
  WHERE g.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND d.deleted_at IS NULL
    AND COALESCE(g.principal_email, g.principal_user_principal_name) IS NOT NULL
)
SELECT
  site_key,
  COUNT(DISTINCT email) FILTER (WHERE email LIKE '%#ext#%')::int AS guest_users,
  COUNT(DISTINCT email) FILTER (WHERE email NOT LIKE '%#ext#%')::int AS external_users,
  MAX(synced_at) AS last_seen_at
FROM grants
GROUP BY site_key;

CREATE UNIQUE INDEX IF NOT EXISTS mv_msgraph_site_external_principals_uidx
ON mv_msgraph_site_external_principals (site_key);

INSERT INTO mv_dependencies (mv_name, table_name) VALUES
  ('mv_msgraph_routable_site_drives', 'msgraph_sites'),
  ('mv_msgraph_routable_site_drives', 'msgraph_drives'),
  ('mv_msgraph_routable_site_drives', 'msgraph_drive_items'),
  ('mv_msgraph_routable_site_drives', 'msgraph_drive_item_permissions'),
  ('mv_msgraph_routable_site_drives', 'msgraph_users'),
  ('mv_msgraph_site_external_principals', 'msgraph_drives'),
  ('mv_msgraph_site_external_principals', 'msgraph_drive_item_permissions'),
  ('mv_msgraph_site_external_principals', 'msgraph_drive_item_permission_grants')
ON CONFLICT DO NOTHING;

INSERT INTO jobs (job_id, job_type, tenant_id, config, enabled)
SELECT gen_random_uuid(), 'mv_refresh', 'default', '{"max_views_per_run": 20}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE job_type = 'mv_refresh');

INSERT INTO job_schedules (schedule_id, job_id, cron_expr, next_run_at, enabled)
SELECT gen_random_uuid(), j.job_id, '*/5 * * * *', NULL, true
FROM jobs j
LEFT JOIN job_schedules js ON js.job_id = j.job_id
WHERE j.job_type = 'mv_refresh' AND js.job_id IS NULL;

INSERT INTO mv_refresh_queue (mv_name, dirty_since)
SELECT DISTINCT mv_name, now()
FROM mv_dependencies
ON CONFLICT (mv_name) DO NOTHING;
