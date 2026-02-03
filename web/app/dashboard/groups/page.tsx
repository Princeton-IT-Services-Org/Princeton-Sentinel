import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, SearchParams } from "@/app/lib/params";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE g.deleted_at IS NULL AND (LOWER(g.display_name) LIKE $1 OR LOWER(g.mail) LIKE $1 OR LOWER(g.id) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export default async function GroupsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "members";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    group: "g.display_name",
    visibility: "g.visibility",
    members: "member_count",
    created: "g.created_dt",
  };
  const sortColumn = sortMap[sort] || "member_count";

  const { clause, params } = buildSearchFilter(search);

  const rows = await query<any>(
    `
    WITH member_counts AS (
      SELECT group_id, COUNT(*)::int AS member_count
      FROM msgraph_group_memberships
      WHERE deleted_at IS NULL
      GROUP BY group_id
    )
    SELECT
      g.id,
      g.display_name,
      g.mail,
      g.visibility,
      g.created_dt,
      COALESCE(mc.member_count, 0) AS member_count
    FROM msgraph_groups g
    LEFT JOIN member_counts mc ON mc.group_id = g.id
    ${clause || "WHERE g.deleted_at IS NULL"}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );

  const countRows = await query<any>(
    `SELECT COUNT(*)::int AS total FROM msgraph_groups g ${clause || "WHERE g.deleted_at IS NULL"}`,
    params
  );
  const total = countRows[0]?.total || 0;

  const topGroups = [...rows].sort((a, b) => b.member_count - a.member_count).slice(0, 10);

  const visibilityBreakdown = await query<any>(
    `
    SELECT COALESCE(g.visibility, 'unknown') AS visibility, COUNT(*)::int AS count
    FROM msgraph_groups g
    ${clause || "WHERE g.deleted_at IS NULL"}
    GROUP BY COALESCE(g.visibility, 'unknown')
    ORDER BY count DESC
    `,
    params
  );

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Groups</h2>
            <p className="text-sm text-slate">Cached (DB) • Browse Microsoft 365 groups and memberships.</p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search groups"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">Search</button>
          </form>
        </div>
        <div className="mt-4 text-sm text-slate">Total groups: {formatNumber(total)}</div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Top Groups by Members</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {topGroups.map((row) => (
              <div key={row.id} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/groups/${encodeURIComponent(row.id)}`}>
                  {row.display_name || row.id}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.member_count)}</span>
              </div>
            ))}
            {!topGroups.length && <div className="text-sm text-slate">No groups.</div>}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Visibility Breakdown</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {visibilityBreakdown.map((row: any) => (
              <div key={row.visibility} className="flex items-center justify-between">
                <span className="text-ink">{row.visibility}</span>
                <span className="font-semibold text-slate">{formatNumber(row.count)}</span>
              </div>
            ))}
            {!visibilityBreakdown.length && <div className="text-sm text-slate">No data.</div>}
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Groups List</h3>
          <div className="text-xs text-slate">Showing {rows.length} of {formatNumber(total)}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Group</th>
                <th className="py-2">Visibility</th>
                <th className="py-2">Members</th>
                <th className="py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.id} className="border-t border-white/60">
                  <td className="py-3">
                    <Link className="font-semibold text-ink underline decoration-dotted" href={`/dashboard/groups/${encodeURIComponent(row.id)}`}>
                      {row.display_name || row.id}
                    </Link>
                    <div className="text-xs text-slate">{row.mail || "--"}</div>
                  </td>
                  <td className="py-3 text-slate">{row.visibility || "unknown"}</td>
                  <td className="py-3 text-slate">{formatNumber(row.member_count)}</td>
                  <td className="py-3 text-slate">{formatDate(row.created_dt)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={4}>No groups match that filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
