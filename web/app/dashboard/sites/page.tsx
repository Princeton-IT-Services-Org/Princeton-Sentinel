import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatBytes, formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, SearchParams } from "@/app/lib/params";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE (LOWER(title) LIKE $1 OR LOWER(web_url) LIKE $1 OR LOWER(site_id) LIKE $1 OR LOWER(site_key) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export default async function SitesPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "lastActivity";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    title: "title",
    type: "is_personal",
    template: "template",
    created: "created_dt",
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

  const summaryRows = await query<any>(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_dt >= now() - interval '30 days')::int AS new_30,
      COUNT(*) FILTER (WHERE created_dt >= now() - interval '90 days')::int AS new_90,
      COUNT(*) FILTER (WHERE is_personal = true)::int AS personal_count,
      COUNT(*) FILTER (WHERE is_personal = false)::int AS sharepoint_count
    FROM mv_msgraph_site_inventory
    ${clause}
    `,
    params
  );

  const createdSeries = await query<any>(
    `
    SELECT date_trunc('month', created_dt) AS month, COUNT(*)::int AS count
    FROM mv_msgraph_site_inventory
    ${clause}
    GROUP BY date_trunc('month', created_dt)
    ORDER BY month DESC
    LIMIT 12
    `,
    params
  );

  const rows = await query<any>(
    `
    SELECT site_key, site_id, title, web_url, created_dt, is_personal, template,
           storage_used_bytes, storage_total_bytes, last_activity_dt
    FROM mv_msgraph_site_inventory
    ${clause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );

  const summary = summaryRows[0] || {};

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">Sites Inventory</h2>
            <p className="text-sm text-slate">Cached (DB) • Search across sites and personal drives.</p>
          </div>
          <form className="flex flex-wrap gap-2" method="get">
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search sites, URLs, ids"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">
              Search
            </button>
          </form>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Total Sites</div>
            <div className="text-2xl font-semibold text-ink">{formatNumber(summary.total || total)}</div>
            <div className="text-xs text-slate">New 30d: {formatNumber(summary.new_30 || 0)}</div>
            <div className="text-xs text-slate">New 90d: {formatNumber(summary.new_90 || 0)}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Type Breakdown</div>
            <div className="mt-3 grid gap-1 text-sm">
              <div className="flex items-center justify-between">
                <span>SharePoint</span>
                <span className="font-semibold">{formatNumber(summary.sharepoint_count || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Personal</span>
                <span className="font-semibold">{formatNumber(summary.personal_count || 0)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Created Per Month</div>
            <div className="mt-3 grid gap-1 text-sm">
              {createdSeries.map((row: any) => (
                <div key={row.month} className="flex items-center justify-between">
                  <span>{formatDate(row.month)}</span>
                  <span className="font-semibold">{formatNumber(row.count)}</span>
                </div>
              ))}
              {!createdSeries.length && <div className="text-xs text-slate">No created dates yet.</div>}
            </div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl">Sites</h3>
          <div className="text-xs text-slate">Showing {rows.length} of {formatNumber(total)}</div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Title</th>
                <th className="py-2">Type</th>
                <th className="py-2">Template</th>
                <th className="py-2">Created</th>
                <th className="py-2">Storage</th>
                <th className="py-2">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.site_key} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">
                      <Link className="underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                        {row.title || row.site_id}
                      </Link>
                    </div>
                    <div className="text-xs text-slate">
                      {row.web_url ? (
                        <a className="underline decoration-dotted" href={row.web_url} target="_blank" rel="noreferrer">
                          {row.web_url}
                        </a>
                      ) : (
                        row.site_id
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-slate">{row.is_personal ? "Personal" : "SharePoint"}</td>
                  <td className="py-3 text-slate">{row.template || "--"}</td>
                  <td className="py-3 text-slate">{formatDate(row.created_dt)}</td>
                  <td className="py-3 text-slate">
                    {formatBytes(row.storage_used_bytes)} / {formatBytes(row.storage_total_bytes)}
                  </td>
                  <td className="py-3 text-slate">{formatDate(row.last_activity_dt)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={6}>
                    No sites match that search.
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
