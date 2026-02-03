import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, SearchParams } from "@/app/lib/params";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE (LOWER(i.title) LIKE $1 OR LOWER(i.web_url) LIKE $1 OR LOWER(i.site_id) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export default async function SharingPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const lbPage = Number(getParam(searchParams, "lbPage") || 1);
  const lbPageSize = Number(getParam(searchParams, "lbPageSize") || 10);
  const sort = getParam(searchParams, "sort") || "links";
  const dir = getSortDirection(searchParams, "desc");
  const externalThreshold = Number(getParam(searchParams, "externalThreshold") || 10);

  const sortMap: Record<string, string> = {
    site: "i.title",
    links: "s.sharing_links",
    anonymous: "s.anonymous_links",
    guests: "s.sharing_links",
    external: "s.sharing_links",
    lastShare: "s.last_shared_at",
  };
  const sortColumn = sortMap[sort] || "s.sharing_links";
  const { clause, params } = buildSearchFilter(search);

  const breakdownRows = await query<any>(
    `
    SELECT link_scope, link_type, COUNT(*)::int AS count
    FROM msgraph_drive_item_permissions
    WHERE deleted_at IS NULL
    GROUP BY link_scope, link_type
    ORDER BY count DESC
    LIMIT $1 OFFSET $2
    `,
    [lbPageSize, (lbPage - 1) * lbPageSize]
  );

  const totalLinksRows = await query<any>(
    `SELECT COUNT(*)::int AS total FROM msgraph_drive_item_permissions WHERE deleted_at IS NULL AND link_scope IS NOT NULL`
  );

  const topSites = await query<any>(
    `
    SELECT i.site_key, i.title, s.sharing_links
    FROM mv_msgraph_site_inventory i
    JOIN mv_msgraph_site_sharing_summary s ON s.site_key = i.site_key
    ORDER BY s.sharing_links DESC NULLS LAST
    LIMIT 10
    `
  );

  const countRows = await query<any>(
    `SELECT COUNT(*)::int AS total FROM mv_msgraph_site_inventory i ${clause}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const siteRows = await query<any>(
    `
    SELECT
      i.site_key,
      i.site_id,
      i.title,
      i.web_url,
      i.is_personal,
      s.sharing_links,
      s.anonymous_links,
      s.organization_links,
      s.last_shared_at
    FROM mv_msgraph_site_inventory i
    LEFT JOIN mv_msgraph_site_sharing_summary s ON s.site_key = i.site_key
    ${clause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );

  const patterns = getInternalDomainPatterns();
  const siteKeys = siteRows.map((row: any) => row.site_key);
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
    externalMap = new Map(
      externalRows.map((row: any) => [row.site_key, { guest_users: row.guest_users, external_users: row.external_users }])
    );
  }

  const totalLinks = totalLinksRows[0]?.total || 0;

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Sharing Overview</h2>
            <p className="text-sm text-slate">Cached (DB) • Global link inventory with per-site posture.</p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search sites"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <input
              name="externalThreshold"
              defaultValue={externalThreshold}
              className="w-28 rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">
              Apply
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Total Links</h3>
          <div className="mt-3 text-3xl font-semibold text-ink">{formatNumber(totalLinks)}</div>
          <div className="mt-4 text-sm text-slate">Top 10 sites by total links</div>
          <div className="mt-3 grid gap-2 text-sm">
            {topSites.map((row: any) => (
              <div key={row.site_key} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                  {row.title || row.site_key}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.sharing_links)}</span>
              </div>
            ))}
            {!topSites.length && <div className="text-sm text-slate">No sharing data yet.</div>}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Link Breakdown</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Scope</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Count</th>
                </tr>
              </thead>
              <tbody>
              {breakdownRows.map((row: any) => {
                const scopeParam = row.link_scope === null ? "null" : row.link_scope;
                const typeParam = row.link_type === null ? "null" : row.link_type;
                return (
                  <tr key={`${scopeParam}-${typeParam}`} className="border-t border-white/60">
                    <td className="py-3 text-ink">
                      <Link
                        className="underline decoration-dotted"
                        href={`/dashboard/sharing/links?scope=${encodeURIComponent(scopeParam)}&type=${encodeURIComponent(typeParam)}`}
                      >
                        {row.link_scope || "(direct)"}
                      </Link>
                    </td>
                    <td className="py-3 text-slate">{row.link_type || "--"}</td>
                    <td className="py-3 text-slate">{formatNumber(row.count)}</td>
                  </tr>
                );
              })}
                {!breakdownRows.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={3}>
                      No link data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Sites</h3>
          <div className="text-xs text-slate">Showing {siteRows.length} of {formatNumber(total)}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Site</th>
                <th className="py-2">Total Links</th>
                <th className="py-2">Anonymous</th>
                <th className="py-2">Guests</th>
                <th className="py-2">External</th>
                <th className="py-2">Last Share</th>
              </tr>
            </thead>
            <tbody>
              {siteRows.map((row: any) => {
                const external = externalMap.get(row.site_key) || { guest_users: 0, external_users: 0 };
                const oversharing = externalThreshold > 0 && external.external_users >= externalThreshold;
                return (
                  <tr key={row.site_key} className="border-t border-white/60">
                    <td className="py-3">
                      <div className="font-semibold text-ink">
                        <Link className="underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                          {row.title || row.site_id}
                        </Link>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-slate">
                        {oversharing && <span className="badge badge-error">Oversharing</span>}
                        {row.anonymous_links > 0 && <span className="badge badge-warn">Anonymous</span>}
                      </div>
                    </td>
                    <td className="py-3 text-slate">{formatNumber(row.sharing_links || 0)}</td>
                    <td className="py-3 text-slate">{formatNumber(row.anonymous_links || 0)}</td>
                    <td className="py-3 text-slate">{formatNumber(external.guest_users || 0)}</td>
                    <td className="py-3 text-slate">{formatNumber(external.external_users || 0)}</td>
                    <td className="py-3 text-slate">{formatDate(row.last_shared_at)}</td>
                  </tr>
                );
              })}
              {!siteRows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={6}>
                    No sites match that filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
