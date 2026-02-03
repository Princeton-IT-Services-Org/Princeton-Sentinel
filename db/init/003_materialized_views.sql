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
  ('mv_latest_job_runs', 'job_runs')
ON CONFLICT DO NOTHING;
