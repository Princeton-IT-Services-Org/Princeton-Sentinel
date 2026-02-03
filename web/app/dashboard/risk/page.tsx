import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatBytes, formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, getWindowDays, SearchParams } from "@/app/lib/params";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";

function itemKey(driveId: string, itemId: string) {
  return encodeURIComponent(`${driveId}::${itemId}`);
}

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE (LOWER(i.title) LIKE $1 OR LOWER(i.web_url) LIKE $1 OR LOWER(i.site_id) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export default async function RiskPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const scanLimit = Math.min(Math.max(Number(getParam(searchParams, "scanLimit") || process.env.DASHBOARD_RISK_SCAN_LIMIT || 500), 50), 2000);
  const dormantDays = Number(getParam(searchParams, "dormantDays") || process.env.DASHBOARD_DORMANT_LOOKBACK_DAYS || 90);
  const windowDays = getWindowDays(searchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "flags";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    site: "title",
    flags: "flag_count",
    storage: "storage_used_bytes",
    lastActivity: "last_activity_dt",
  };
  const sortColumn = sortMap[sort] || "flag_count";

  const { clause, params } = buildSearchFilter(search);

  const sites = await query<any>(
    `
    SELECT
      i.site_key,
      i.site_id,
      i.title,
      i.web_url,
      i.is_personal,
      i.storage_used_bytes,
      i.storage_total_bytes,
      i.last_activity_dt,
      s.sharing_links,
      s.anonymous_links,
      s.organization_links
    FROM mv_msgraph_site_inventory i
    LEFT JOIN mv_msgraph_site_sharing_summary s ON s.site_key = i.site_key
    ${clause}
    ORDER BY i.last_activity_dt DESC NULLS LAST
    LIMIT $${params.length + 1}
    `,
    [...params, scanLimit]
  );

  const siteKeys = sites.map((row: any) => row.site_key);
  const patterns = getInternalDomainPatterns();
  let externalMap = new Map<string, { guest_users: number; external_users: number }>();
  if (siteKeys.length) {
    const externalRows = await query<any>(
      `
      WITH selected AS (
        SELECT unnest($1::text[]) AS site_key
      ), grants AS (
        SELECT
          CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
          COALESCE(g.principal_email, g.principal_user_principal_name) AS email
        FROM msgraph_drive_item_permission_grants g
        JOIN msgraph_drive_item_permissions p
          ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
        JOIN msgraph_drives d ON d.id = p.drive_id
        JOIN selected s ON s.site_key = CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
        WHERE g.deleted_at IS NULL AND p.deleted_at IS NULL AND d.deleted_at IS NULL
          AND COALESCE(g.principal_email, g.principal_user_principal_name) IS NOT NULL
      )
      SELECT
        site_key,
        COUNT(DISTINCT email) FILTER (WHERE email ILIKE '%#EXT#%')::int AS guest_users,
        COUNT(DISTINCT email) FILTER (
          WHERE email NOT ILIKE '%#EXT#%'
            AND COALESCE(array_length($2::text[], 1), 0) > 0
            AND NOT (split_part(lower(email), '@', 2) LIKE ANY($2::text[]))
        )::int AS external_users
      FROM grants
      GROUP BY site_key
      `,
      [siteKeys, patterns]
    );
    externalMap = new Map(externalRows.map((row: any) => [row.site_key, { guest_users: row.guest_users, external_users: row.external_users }]));
  }

  const enrichedSites = sites.map((row: any) => {
    const external = externalMap.get(row.site_key) || { guest_users: 0, external_users: 0 };
    const dormant = !row.last_activity_dt || new Date(row.last_activity_dt).getTime() < Date.now() - dormantDays * 24 * 60 * 60 * 1000;
    const anonymousLinksSignal = (row.anonymous_links || 0) > 0;
    const orgLinksSignal = (row.organization_links || 0) > 0;
    const externalUsersSignal = external.external_users > 0;
    const guestUsersSignal = external.guest_users > 0;
    const flagCount = [dormant, anonymousLinksSignal, orgLinksSignal, externalUsersSignal, guestUsersSignal].filter(Boolean).length;
    return {
      ...row,
      dormant,
      anonymousLinksSignal,
      orgLinksSignal,
      externalUsersSignal,
      guestUsersSignal,
      external_users: external.external_users,
      guest_users: external.guest_users,
      flag_count: flagCount,
    };
  });

  const flaggedSites = enrichedSites.filter((site: any) => site.flag_count > 0);
  const flaggedCount = flaggedSites.length;

  const sortedFlagged = [...flaggedSites].sort((a, b) => {
    if (sortColumn === "flag_count") return dir === "asc" ? a.flag_count - b.flag_count : b.flag_count - a.flag_count;
    if (sortColumn === "storage_used_bytes") return dir === "asc" ? a.storage_used_bytes - b.storage_used_bytes : b.storage_used_bytes - a.storage_used_bytes;
    if (sortColumn === "last_activity_dt") return dir === "asc" ? new Date(a.last_activity_dt || 0).getTime() - new Date(b.last_activity_dt || 0).getTime() : new Date(b.last_activity_dt || 0).getTime() - new Date(a.last_activity_dt || 0).getTime();
    return dir === "asc" ? (a.title || "").localeCompare(b.title || "") : (b.title || "").localeCompare(a.title || "");
  });
  const pagedFlagged = sortedFlagged.slice(offset, offset + pageSize);

  const anonymousItems = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, COUNT(*)::int AS links
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drive_items i ON i.drive_id = p.drive_id AND i.id = p.item_id
    WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL AND p.link_scope = 'anonymous'
      ${windowStart ? "AND p.synced_at >= $1" : ""}
    GROUP BY i.drive_id, i.id, i.name, i.web_url
    ORDER BY links DESC NULLS LAST
    LIMIT 25
    `,
    windowStart ? [windowStart] : []
  );

  const orgItems = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, COUNT(*)::int AS links
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drive_items i ON i.drive_id = p.drive_id AND i.id = p.item_id
    WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL AND p.link_scope = 'organization'
      ${windowStart ? "AND p.synced_at >= $1" : ""}
    GROUP BY i.drive_id, i.id, i.name, i.web_url
    ORDER BY links DESC NULLS LAST
    LIMIT 25
    `,
    windowStart ? [windowStart] : []
  );

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Risk Signals</h2>
            <p className="text-sm text-slate">Cached (DB) • Flags derived from dormant activity and sharing exposure.</p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search sites"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <input
              name="scanLimit"
              defaultValue={scanLimit}
              className="w-28 rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <input
              name="dormantDays"
              defaultValue={dormantDays}
              className="w-28 rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <input
              name="days"
              defaultValue={windowDays ? String(windowDays) : "all"}
              className="w-24 rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">Apply</button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-4">
        <div className="card p-6">
          <div className="text-sm text-slate">Flagged sites</div>
          <div className="text-3xl font-semibold text-ink">{formatNumber(flaggedCount)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Files with anonymous links</div>
          <div className="text-3xl font-semibold text-ink">{formatNumber(anonymousItems.length)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Files with org-wide links</div>
          <div className="text-3xl font-semibold text-ink">{formatNumber(orgItems.length)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Sites scanned</div>
          <div className="text-3xl font-semibold text-ink">{formatNumber(sites.length)}</div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Files with Anonymous Links</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Links</th>
                </tr>
              </thead>
              <tbody>
                {anonymousItems.map((row: any) => (
                  <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                    <td className="py-3">
                      <Link className="font-semibold text-ink underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                        {row.name || row.id}
                      </Link>
                    </td>
                    <td className="py-3 text-slate">{formatNumber(row.links)}</td>
                  </tr>
                ))}
                {!anonymousItems.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={2}>No anonymous link items.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Files with Org-Wide Links</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Links</th>
                </tr>
              </thead>
              <tbody>
                {orgItems.map((row: any) => (
                  <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                    <td className="py-3">
                      <Link className="font-semibold text-ink underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                        {row.name || row.id}
                      </Link>
                    </td>
                    <td className="py-3 text-slate">{formatNumber(row.links)}</td>
                  </tr>
                ))}
                {!orgItems.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={2}>No org-wide link items.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Flagged Sites</h3>
          <div className="text-xs text-slate">Showing {pagedFlagged.length} of {formatNumber(flaggedCount)}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Site</th>
                <th className="py-2">Signals</th>
                <th className="py-2">Exposure</th>
                <th className="py-2">Storage</th>
                <th className="py-2">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {pagedFlagged.map((site: any) => (
                <tr key={site.site_key} className="border-t border-white/60">
                  <td className="py-3">
                    <Link className="font-semibold text-ink underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}`}>
                      {site.title || site.site_id}
                    </Link>
                    <div className="text-xs text-slate">{site.is_personal ? "Personal" : "SharePoint"}</div>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {site.dormant && <span className="badge badge-warn">Dormant</span>}
                      {site.anonymousLinksSignal && <span className="badge badge-error">Anonymous</span>}
                      {site.orgLinksSignal && <span className="badge badge-warn">Org-wide</span>}
                      {site.externalUsersSignal && <span className="badge badge-error">External</span>}
                      {site.guestUsersSignal && <span className="badge badge-warn">Guest</span>}
                    </div>
                  </td>
                  <td className="py-3 text-slate">
                    Links: {formatNumber(site.sharing_links || 0)}
                    <br />
                    Guests: {formatNumber(site.guest_users || 0)} • External: {formatNumber(site.external_users || 0)}
                  </td>
                  <td className="py-3 text-slate">{formatBytes(site.storage_used_bytes)} / {formatBytes(site.storage_total_bytes)}</td>
                  <td className="py-3 text-slate">{formatDate(site.last_activity_dt)}</td>
                </tr>
              ))}
              {!pagedFlagged.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={5}>No flagged sites within the scan limit.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
