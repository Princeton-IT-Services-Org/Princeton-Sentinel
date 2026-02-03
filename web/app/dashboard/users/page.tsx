import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, getWindowDays, SearchParams } from "@/app/lib/params";

function buildSearchClause(search: string | null, startIndex: number) {
  if (!search) return { clause: "", params: [] as any[] };
  const pattern = `%${search.toLowerCase()}%`;
  const clause = `AND (LOWER(u.display_name) LIKE $${startIndex} OR LOWER(u.mail) LIKE $${startIndex} OR LOWER(u.user_principal_name) LIKE $${startIndex} OR LOWER(a.user_id) LIKE $${startIndex})`;
  return { clause, params: [pattern] };
}

export default async function UsersPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const windowDays = getWindowDays(searchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "modified";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    user: "u.display_name",
    modified: "a.modified_items",
    sites: "a.sites_touched",
    lastModified: "a.last_modified_dt",
  };
  const sortColumn = sortMap[sort] || "a.modified_items";

  const searchClause = buildSearchClause(search, windowStart ? 2 : 1);

  const rows = await query<any>(
    `
    WITH activity AS (
      SELECT
        i.last_modified_by_user_id AS user_id,
        COUNT(*)::int AS modified_items,
        COUNT(DISTINCT COALESCE(d.site_id, d.id))::int AS sites_touched,
        MAX(i.modified_dt) AS last_modified_dt
      FROM msgraph_drive_items i
      JOIN msgraph_drives d ON d.id = i.drive_id
      WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
        AND i.last_modified_by_user_id IS NOT NULL
        ${windowStart ? "AND i.modified_dt >= $1" : ""}
      GROUP BY i.last_modified_by_user_id
    )
    SELECT
      a.user_id,
      u.display_name,
      u.mail,
      u.user_principal_name,
      a.modified_items,
      a.sites_touched,
      a.last_modified_dt
    FROM activity a
    LEFT JOIN msgraph_users u ON u.id = a.user_id AND u.deleted_at IS NULL
    WHERE 1=1
      ${searchClause.clause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${windowStart ? 2 + searchClause.params.length : 1 + searchClause.params.length}
    OFFSET $${windowStart ? 3 + searchClause.params.length : 2 + searchClause.params.length}
    `,
    windowStart
      ? [windowStart, ...searchClause.params, pageSize, offset]
      : [...searchClause.params, pageSize, offset]
  );

  const totalRows = await query<any>(
    `
    WITH activity AS (
      SELECT
        i.last_modified_by_user_id AS user_id
      FROM msgraph_drive_items i
      JOIN msgraph_drives d ON d.id = i.drive_id
      WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
        AND i.last_modified_by_user_id IS NOT NULL
        ${windowStart ? "AND i.modified_dt >= $1" : ""}
      GROUP BY i.last_modified_by_user_id
    )
    SELECT COUNT(*)::int AS total
    FROM activity a
    LEFT JOIN msgraph_users u ON u.id = a.user_id AND u.deleted_at IS NULL
    WHERE 1=1
      ${searchClause.clause}
    `,
    windowStart ? [windowStart, ...searchClause.params] : [...searchClause.params]
  );

  const total = totalRows[0]?.total || 0;

  const topByModified = [...rows].sort((a, b) => b.modified_items - a.modified_items).slice(0, 10);
  const topBySites = [...rows].sort((a, b) => b.sites_touched - a.sites_touched).slice(0, 10);

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Users Activity</h2>
            <p className="text-sm text-slate">Cached (DB) • Window: {windowDays || "all"} days</p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search users"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <input
              name="days"
              defaultValue={windowDays ? String(windowDays) : "all"}
              className="w-24 rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">Apply</button>
          </form>
        </div>
        <div className="mt-4 text-sm text-slate">Total users with activity: {formatNumber(total)}</div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Top Users by Modified Items</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {topByModified.map((row) => (
              <div key={row.user_id} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/users/${encodeURIComponent(row.user_id)}`}>
                  {row.display_name || row.user_principal_name || row.mail || row.user_id}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.modified_items)}</span>
              </div>
            ))}
            {!topByModified.length && <div className="text-sm text-slate">No activity.</div>}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Top Users by Sites Touched</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {topBySites.map((row) => (
              <div key={row.user_id} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/users/${encodeURIComponent(row.user_id)}`}>
                  {row.display_name || row.user_principal_name || row.mail || row.user_id}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.sites_touched)}</span>
              </div>
            ))}
            {!topBySites.length && <div className="text-sm text-slate">No activity.</div>}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Active Users</h3>
          <div className="text-xs text-slate">Showing {rows.length} of {formatNumber(total)}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">User</th>
                <th className="py-2">Items Modified</th>
                <th className="py-2">Sites Touched</th>
                <th className="py-2">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.user_id} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">
                      <Link className="underline decoration-dotted" href={`/dashboard/users/${encodeURIComponent(row.user_id)}`}>
                        {row.display_name || row.user_principal_name || row.mail || row.user_id}
                      </Link>
                    </div>
                    <div className="text-xs text-slate">{row.mail || row.user_principal_name}</div>
                  </td>
                  <td className="py-3 text-slate">{formatNumber(row.modified_items)}</td>
                  <td className="py-3 text-slate">{formatNumber(row.sites_touched)}</td>
                  <td className="py-3 text-slate">{formatDate(row.last_modified_dt)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={4}>
                    No users match that filter.
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
