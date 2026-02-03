import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatBytes, formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, getWindowDays, SearchParams } from "@/app/lib/params";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE (LOWER(title) LIKE $1 OR LOWER(web_url) LIKE $1 OR LOWER(site_id) LIKE $1 OR LOWER(site_key) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export default async function ActivityPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const windowDays = getWindowDays(searchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "lastActivity";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    site: "title",
    modified: "modified_items",
    shares: "shares",
    activeUsers: "active_users",
    storage: "storage_used_bytes",
    lastActivity: "last_activity_dt",
  };
  const sortColumn = sortMap[sort] || "last_activity_dt";
  const { clause, params } = buildSearchFilter(search);

  const countRows = await query<any>(
    `SELECT COUNT(*)::int AS total FROM mv_msgraph_site_inventory ${clause}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const dataRows = await query<any>(
    `
    WITH base AS (
      SELECT site_key, site_id, title, web_url, is_personal, storage_used_bytes, storage_total_bytes, last_activity_dt
      FROM mv_msgraph_site_inventory
      ${clause}
    ), activity AS (
      SELECT
        CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
        COUNT(*) FILTER (${windowStart ? "WHERE i.modified_dt >= $" + (params.length + 1) : "WHERE i.modified_dt IS NOT NULL"})::int AS modified_items,
        COUNT(DISTINCT i.last_modified_by_user_id) FILTER (${windowStart ? "WHERE i.modified_dt >= $" + (params.length + 1) : "WHERE i.modified_dt IS NOT NULL"})::int AS active_users
      FROM msgraph_drive_items i
      JOIN msgraph_drives d ON d.id = i.drive_id
      JOIN base b ON b.site_key = CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
      WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      GROUP BY CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
    ), shares AS (
      SELECT
        CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
        COUNT(*) FILTER (${windowStart ? "WHERE p.synced_at >= $" + (params.length + 1) : "WHERE p.synced_at IS NOT NULL"})::int AS shares
      FROM msgraph_drive_item_permissions p
      JOIN msgraph_drives d ON d.id = p.drive_id
      JOIN base b ON b.site_key = CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
      WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL AND p.link_scope IS NOT NULL
      GROUP BY CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
    )
    SELECT
      b.*, COALESCE(a.modified_items, 0) AS modified_items,
      COALESCE(a.active_users, 0) AS active_users,
      COALESCE(s.shares, 0) AS shares
    FROM base b
    LEFT JOIN activity a ON a.site_key = b.site_key
    LEFT JOIN shares s ON s.site_key = b.site_key
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${params.length + (windowStart ? 2 : 1)} OFFSET $${params.length + (windowStart ? 3 : 2)}
    `,
    windowStart ? [...params, windowStart, pageSize, offset] : [...params, pageSize, offset]
  );

  const topActiveUsers = [...dataRows]
    .sort((a, b) => b.active_users - a.active_users)
    .slice(0, 10);
  const topSharesMods = [...dataRows]
    .sort((a, b) => (b.shares + b.modified_items) - (a.shares + a.modified_items))
    .slice(0, 10);

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Site Activity</h2>
            <p className="text-sm text-slate">Cached (DB) • Window: {windowDays || "all"} days</p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search sites"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <input
              name="days"
              defaultValue={windowDays ? String(windowDays) : "all"}
              placeholder="days"
              className="w-24 rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">
              Apply
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Top Sites by Active Users</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {topActiveUsers.map((row) => (
              <div key={row.site_key} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                  {row.title || row.site_id}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.active_users)}</span>
              </div>
            ))}
            {!topActiveUsers.length && <div className="text-sm text-slate">No activity.</div>}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Top Sites by Shares + Mods</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {topSharesMods.map((row) => (
              <div key={row.site_key} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                  {row.title || row.site_id}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.shares + row.modified_items)}</span>
              </div>
            ))}
            {!topSharesMods.length && <div className="text-sm text-slate">No activity.</div>}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Sites</h3>
          <div className="text-xs text-slate">Showing {dataRows.length} of {formatNumber(total)}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Site</th>
                <th className="py-2">Modified Items</th>
                <th className="py-2">Shares</th>
                <th className="py-2">Active Users</th>
                <th className="py-2">Storage</th>
                <th className="py-2">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row) => (
                <tr key={row.site_key} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">
                      <Link className="underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                        {row.title || row.site_id}
                      </Link>
                    </div>
                    <div className="text-xs text-slate">{row.is_personal ? "Personal" : "SharePoint"}</div>
                  </td>
                  <td className="py-3 text-slate">{formatNumber(row.modified_items)}</td>
                  <td className="py-3 text-slate">{formatNumber(row.shares)}</td>
                  <td className="py-3 text-slate">{formatNumber(row.active_users)}</td>
                  <td className="py-3 text-slate">
                    {formatBytes(row.storage_used_bytes)} / {formatBytes(row.storage_total_bytes)}
                  </td>
                  <td className="py-3 text-slate">{formatDate(row.last_activity_dt)}</td>
                </tr>
              ))}
              {!dataRows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={6}>
                    No sites in this window.
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
