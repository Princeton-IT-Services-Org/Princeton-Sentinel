export const DRIVE_SITE_KEY_EXPR = "CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END";

export const ROUTABLE_SITE_DRIVES_CTE = `
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
  ),
  routable_site_drives AS (
    SELECT * FROM sharepoint_rows
    UNION ALL
    SELECT * FROM personal_rows
  )
`;
