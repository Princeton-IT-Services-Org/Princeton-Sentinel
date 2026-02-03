import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { graphGet } from "@/app/lib/graph";
import { formatBytes, formatDate, formatNumber, safeDecode } from "@/app/lib/format";
import { getParam, getWindowDays, SearchParams } from "@/app/lib/params";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";

function buildSiteFilter(isPersonal: boolean) {
  if (isPersonal) {
    return { clause: "d.id = $1", join: "JOIN msgraph_drives d ON d.id = i.drive_id" };
  }
  return { clause: "d.site_id = $1", join: "JOIN msgraph_drives d ON d.id = i.drive_id" };
}

export default async function SiteDetailPage({ params, searchParams }: { params: { siteId: string }; searchParams?: SearchParams }) {
  await requireUser();

  const rawId = safeDecode(params.siteId);
  const siteKey = rawId.startsWith("drive:") ? rawId : rawId;

  const siteRows = await query<any>(
    `SELECT * FROM mv_msgraph_site_inventory WHERE site_key = $1`,
    [siteKey]
  );

  if (!siteRows.length) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Site not found</h2>
        <p className="mt-2 text-slate">We could not locate that site in cached inventory.</p>
      </div>
    );
  }

  const site = siteRows[0];
  const isPersonal = site.is_personal === true;
  const windowDays = getWindowDays(searchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const modifiedRows = await query<any>(
    `
    SELECT COUNT(*)::int AS modified_items
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      ${windowStart ? "AND i.modified_dt >= $2" : ""}
    `,
    windowStart ? [site.site_id, windowStart] : [site.site_id]
  );

  const shareRows = await query<any>(
    `
    SELECT COUNT(*)::int AS shares
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drives d ON d.id = p.drive_id
    WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND p.link_scope IS NOT NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      ${windowStart ? "AND p.synced_at >= $2" : ""}
    `,
    windowStart ? [site.site_id, windowStart] : [site.site_id]
  );

  const accessCounts = await query<any>(
    `
    WITH perms AS (
      SELECT p.drive_id, p.item_id, p.permission_id, p.link_scope
      FROM msgraph_drive_item_permissions p
      JOIN msgraph_drives d ON d.id = p.drive_id
      WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND ${isPersonal ? "d.id" : "d.site_id"} = $1
    ), grants AS (
      SELECT g.principal_type, g.principal_id
      FROM msgraph_drive_item_permission_grants g
      JOIN perms p ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
      WHERE g.deleted_at IS NULL
    )
    SELECT
      (SELECT COUNT(DISTINCT principal_id) FROM grants WHERE principal_type = 'user')::int AS direct_users,
      (SELECT COUNT(DISTINCT principal_id) FROM grants WHERE principal_type IN ('group', 'siteGroup'))::int AS group_grants,
      (SELECT COUNT(*) FROM perms WHERE link_scope IS NOT NULL)::int AS sharing_links
    `,
    [site.site_id]
  );

  const patterns = getInternalDomainPatterns();
  const sharingRisk = await query<any>(
    `
    WITH distinct_emails AS (
      SELECT DISTINCT COALESCE(g.principal_email, g.principal_user_principal_name) AS email
      FROM msgraph_drive_item_permission_grants g
      JOIN msgraph_drive_item_permissions p
        ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
      JOIN msgraph_drives d ON d.id = p.drive_id
      WHERE g.deleted_at IS NULL AND p.deleted_at IS NULL AND d.deleted_at IS NULL
        AND ${isPersonal ? "d.id" : "d.site_id"} = $1
        AND COALESCE(g.principal_email, g.principal_user_principal_name) IS NOT NULL
    )
    SELECT
      (SELECT COUNT(*) FROM msgraph_drive_item_permissions p JOIN msgraph_drives d ON d.id = p.drive_id
        WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND ${isPersonal ? "d.id" : "d.site_id"} = $1 AND p.link_scope = 'anonymous')::int AS anonymous_links,
      COUNT(*) FILTER (WHERE email ILIKE '%#EXT#%')::int AS guest_users,
      COUNT(*) FILTER (
        WHERE email NOT ILIKE '%#EXT#%'
          AND COALESCE(array_length($2::text[], 1), 0) > 0
          AND NOT (split_part(lower(email), '@', 2) LIKE ANY($2::text[]))
      )::int AS external_users
    FROM distinct_emails
    `,
    [site.site_id, patterns]
  );

  const seriesModified = await query<any>(
    `
    SELECT date_trunc('day', i.modified_dt) AS day, COUNT(*)::int AS count
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      ${windowStart ? "AND i.modified_dt >= $2" : ""}
    GROUP BY date_trunc('day', i.modified_dt)
    ORDER BY day DESC
    LIMIT 90
    `,
    windowStart ? [site.site_id, windowStart] : [site.site_id]
  );

  const seriesShares = await query<any>(
    `
    SELECT date_trunc('day', p.synced_at) AS day, COUNT(*)::int AS count
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drives d ON d.id = p.drive_id
    WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND p.link_scope IS NOT NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      ${windowStart ? "AND p.synced_at >= $2" : ""}
    GROUP BY date_trunc('day', p.synced_at)
    ORDER BY day DESC
    LIMIT 90
    `,
    windowStart ? [site.site_id, windowStart] : [site.site_id]
  );

  const seriesMap = new Map<string, { date: string; modifiedItems: number; shares: number }>();
  for (const row of seriesModified) {
    const key = row.day ? new Date(row.day).toISOString().slice(0, 10) : "--";
    seriesMap.set(key, { date: key, modifiedItems: row.count, shares: 0 });
  }
  for (const row of seriesShares) {
    const key = row.day ? new Date(row.day).toISOString().slice(0, 10) : "--";
    const existing = seriesMap.get(key) || { date: key, modifiedItems: 0, shares: 0 };
    existing.shares = row.count;
    seriesMap.set(key, existing);
  }
  const series = Array.from(seriesMap.values()).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 14);

  const topUsers = await query<any>(
    `
    SELECT
      i.last_modified_by_user_id AS user_id,
      COUNT(*)::int AS modified_items,
      MAX(i.modified_dt) AS last_modified_dt,
      u.display_name,
      u.mail,
      u.user_principal_name
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    LEFT JOIN msgraph_users u ON u.id = i.last_modified_by_user_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND i.last_modified_by_user_id IS NOT NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      ${windowStart ? "AND i.modified_dt >= $2" : ""}
    GROUP BY i.last_modified_by_user_id, u.display_name, u.mail, u.user_principal_name
    ORDER BY modified_items DESC
    LIMIT 10
    `,
    windowStart ? [site.site_id, windowStart] : [site.site_id]
  );

  let livePermissions: any = null;
  let liveError: string | null = null;
  if (!isPersonal) {
    try {
      livePermissions = await graphGet(`/sites/${site.site_id}/permissions`);
    } catch (err: any) {
      liveError = err?.message || "Failed to load live permissions";
    }
  }

  const activity = {
    modified_items: modifiedRows[0]?.modified_items || 0,
    shares: shareRows[0]?.shares || 0,
  };
  const access = accessCounts[0] || {};
  const risk = sharingRisk[0] || {};

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">{site.title || site.site_id}</h2>
            <div className="mt-1 text-xs uppercase tracking-[0.3em] text-slate/60">Cached (DB)</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="badge bg-white/70 text-slate">{isPersonal ? "Personal" : "SharePoint"}</span>
              {site.template && <span className="badge bg-white/70 text-slate">{site.template}</span>}
            </div>
            <div className="mt-2 text-sm text-slate">Created {formatDate(site.created_dt)}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/sites">
              Back to Sites
            </Link>
            <Link className="badge bg-amber-100 text-amber-900" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}/sharing`}>
              Sharing
            </Link>
            <Link className="badge bg-emerald-100 text-emerald-900" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}/files`}>
              Files
            </Link>
          </div>
        </div>
        {site.web_url && (
          <div className="mt-3 text-sm">
            <a className="underline decoration-dotted" href={site.web_url} target="_blank" rel="noreferrer">
              {site.web_url}
            </a>
          </div>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="card p-6">
          <h3 className="font-display text-xl">Storage</h3>
          <div className="mt-3 text-sm text-slate">Used</div>
          <div className="text-2xl font-semibold text-ink">{formatBytes(site.storage_used_bytes)}</div>
          <div className="text-xs text-slate">Allocated: {formatBytes(site.storage_total_bytes)}</div>
          <div className="mt-3 text-xs text-slate">Drives: {formatNumber(site.drive_count)}</div>
        </div>
        <div className="card p-6">
          <h3 className="font-display text-xl">Activity ({windowDays || "all"}d)</h3>
          <div className="mt-3 text-sm text-slate">Items modified</div>
          <div className="text-2xl font-semibold text-ink">{formatNumber(activity.modified_items || 0)}</div>
          <div className="mt-2 text-sm text-slate">Link shares</div>
          <div className="text-xl font-semibold text-ink">{formatNumber(activity.shares || 0)}</div>
          <div className="mt-2 text-xs text-slate">Last activity: {formatDate(site.last_activity_dt)}</div>
        </div>
        <div className="card p-6">
          <h3 className="font-display text-xl">Sharing Risk</h3>
          <div className="mt-3 text-sm text-slate">Anonymous links</div>
          <div className="text-2xl font-semibold text-ink">{formatNumber(risk.anonymous_links || 0)}</div>
          <div className="mt-2 text-sm text-slate">Guest users</div>
          <div className="text-xl font-semibold text-ink">{formatNumber(risk.guest_users || 0)}</div>
          <div className="mt-2 text-sm text-slate">External users</div>
          <div className="text-xl font-semibold text-ink">{formatNumber(risk.external_users || 0)}</div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Activity Trend</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Date</th>
                  <th className="py-2">Modified Items</th>
                  <th className="py-2">Shares</th>
                </tr>
              </thead>
              <tbody>
                {series.map((row) => (
                  <tr key={row.date} className="border-t border-white/60">
                    <td className="py-3 text-ink">{row.date}</td>
                    <td className="py-3 text-slate">{formatNumber(row.modifiedItems)}</td>
                    <td className="py-3 text-slate">{formatNumber(row.shares)}</td>
                  </tr>
                ))}
                {!series.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={3}>
                      No activity within the selected window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Access Model</h3>
          <div className="mt-4 grid gap-3">
            <div className="rounded-xl bg-white/60 p-4">
              <div className="text-sm text-slate">Direct user grants</div>
              <div className="text-2xl font-semibold text-ink">{formatNumber(access.direct_users || 0)}</div>
            </div>
            <div className="rounded-xl bg-white/60 p-4">
              <div className="text-sm text-slate">Group grants</div>
              <div className="text-2xl font-semibold text-ink">{formatNumber(access.group_grants || 0)}</div>
            </div>
            <div className="rounded-xl bg-white/60 p-4">
              <div className="text-sm text-slate">Sharing links</div>
              <div className="text-2xl font-semibold text-ink">{formatNumber(access.sharing_links || 0)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="font-display text-xl">Top Active Users ({windowDays || "all"}d)</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">User</th>
                <th className="py-2">Modified Items</th>
                <th className="py-2">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((row: any) => (
                <tr key={row.user_id} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">
                      {row.display_name || row.user_principal_name || row.mail || row.user_id}
                    </div>
                    <div className="text-xs text-slate">{row.mail || row.user_principal_name}</div>
                  </td>
                  <td className="py-3 text-slate">{formatNumber(row.modified_items)}</td>
                  <td className="py-3 text-slate">{formatDate(row.last_modified_dt)}</td>
                </tr>
              ))}
              {!topUsers.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>
                    No user activity available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!isPersonal && (
        <section className="card p-6">
          <h3 className="font-display text-xl">Live (Graph) Site Permissions</h3>
          {liveError ? (
            <div className="mt-3 badge badge-error">{liveError}</div>
          ) : (
            <div className="mt-4 text-sm text-slate">
              Live permissions count: {Array.isArray(livePermissions?.value) ? livePermissions.value.length : 0}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
