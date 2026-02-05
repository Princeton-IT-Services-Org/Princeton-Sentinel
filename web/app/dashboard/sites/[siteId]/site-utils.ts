import { query } from "@/app/lib/db";

export type ResolvedSite = {
  mode: "sharepoint" | "personal";
  site: any;
  personalBaseUrl?: string;
};

function normalizePersonalBaseUrl(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const match = lower.match(/^(.*\/personal\/[^/]+)(?:\/.*)?$/i);
  return match ? match[1] : null;
}

async function fetchPersonalSite(baseUrl: string): Promise<any | null> {
  const rows = await query<any>(
    `
    WITH personal_drives AS (
      SELECT d.id, d.owner_id, d.owner_display_name, d.owner_email, d.created_dt, d.quota_used, d.quota_total, d.web_url
      FROM msgraph_drives d
      WHERE d.deleted_at IS NULL AND d.site_id IS NULL AND d.web_url IS NOT NULL
        AND lower(trim(trailing '/' from d.web_url)) LIKE $1 || '%'
    ),
    personal_names AS (
      SELECT COALESCE(MAX(u.display_name), MAX(d.owner_display_name), MAX(d.owner_email)) AS title
      FROM personal_drives d
      LEFT JOIN msgraph_users u ON u.id = d.owner_id AND u.deleted_at IS NULL
    ),
    personal_storage AS (
      SELECT
        COUNT(*)::int AS drive_count,
        SUM(d.quota_used) AS storage_used_bytes,
        SUM(d.quota_total) AS storage_total_bytes,
        MIN(d.created_dt) AS created_dt
      FROM personal_drives d
    ),
    personal_last_write AS (
      SELECT MAX(i.modified_dt) AS last_write_dt
      FROM msgraph_drive_items i
      JOIN personal_drives d ON d.id = i.drive_id
      WHERE i.deleted_at IS NULL
    ),
    personal_last_share AS (
      SELECT MAX(p.synced_at) AS last_share_dt
      FROM msgraph_drive_item_permissions p
      JOIN personal_drives d ON d.id = p.drive_id
      WHERE p.deleted_at IS NULL AND p.link_scope IS NOT NULL
    )
    SELECT
      $1::text AS site_key,
      $1::text AS site_id,
      COALESCE((SELECT title FROM personal_names), $1::text) AS title,
      $1::text AS web_url,
      (SELECT created_dt FROM personal_storage) AS created_dt,
      true AS is_personal,
      NULL::text AS template,
      (SELECT drive_count FROM personal_storage) AS drive_count,
      (SELECT storage_used_bytes FROM personal_storage) AS storage_used_bytes,
      (SELECT storage_total_bytes FROM personal_storage) AS storage_total_bytes,
      (SELECT last_write_dt FROM personal_last_write) AS last_write_dt,
      (SELECT last_share_dt FROM personal_last_share) AS last_share_dt,
      GREATEST((SELECT last_write_dt FROM personal_last_write), (SELECT last_share_dt FROM personal_last_share)) AS last_activity_dt
    `,
    [baseUrl]
  );

  const row = rows[0];
  if (!row || !row.drive_count || Number(row.drive_count) <= 0) return null;
  return row;
}

export async function resolveSite(rawId: string): Promise<ResolvedSite | null> {
  const looksPersonal = rawId.toLowerCase().includes("/personal/");
  if (looksPersonal) {
    const base = normalizePersonalBaseUrl(rawId);
    if (base) {
      const site = await fetchPersonalSite(base);
      if (site) return { mode: "personal", site, personalBaseUrl: base };
    }
  }

  const sharepointRows = await query<any>(
    `SELECT * FROM mv_msgraph_site_inventory WHERE site_key = $1 AND is_personal = false`,
    [rawId]
  );
  if (sharepointRows.length) {
    return { mode: "sharepoint", site: sharepointRows[0] };
  }

  const driveId = rawId.startsWith("drive:") ? rawId.slice("drive:".length) : rawId;
  const driveRows = await query<any>(
    `
    SELECT web_url
    FROM msgraph_drives
    WHERE id = $1 AND deleted_at IS NULL AND site_id IS NULL AND web_url ILIKE '%/personal/%'
    LIMIT 1
    `,
    [driveId]
  );
  if (driveRows.length) {
    const base = normalizePersonalBaseUrl(driveRows[0].web_url || "");
    if (base) {
      const site = await fetchPersonalSite(base);
      if (site) return { mode: "personal", site, personalBaseUrl: base };
    }
  }

  return null;
}

export const PERSONAL_DRIVES_CTE = `
  WITH personal_drives AS (
    SELECT d.id
    FROM msgraph_drives d
    WHERE d.deleted_at IS NULL AND d.site_id IS NULL AND d.web_url IS NOT NULL
      AND lower(trim(trailing '/' from d.web_url)) LIKE $1 || '%'
  )
`;
