import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate, formatNumber } from "@/app/lib/format";
import { getPagination, getParam, SearchParams } from "@/app/lib/params";

function itemKey(driveId: string, itemId: string) {
  return encodeURIComponent(`${driveId}::${itemId}`);
}

export default async function SharingLinksPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const scope = getParam(searchParams, "scope");
  const type = getParam(searchParams, "type");
  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });

  if (scope === null || type === null) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Missing scope/type</h2>
        <p className="mt-2 text-slate">Provide scope and type query params.</p>
      </div>
    );
  }

  const params: any[] = [];
  let idx = 1;
  const scopeFilter = scope === "null" ? "p.link_scope IS NULL" : `p.link_scope = $${idx++}`;
  if (scope !== "null") params.push(scope);
  const typeFilter = type === "null" ? "p.link_type IS NULL" : `p.link_type = $${idx++}`;
  if (type !== "null") params.push(type);

  let searchClause = "";
  if (search) {
    searchClause = `AND (LOWER(i.name) LIKE $${idx} OR LOWER(i.path) LIKE $${idx} OR LOWER(i.id) LIKE $${idx})`;
    params.push(`%${search.toLowerCase()}%`);
    idx += 1;
  }

  const limitParam = `$${idx}`;
  const offsetParam = `$${idx + 1}`;
  params.push(pageSize, offset);

  const rows = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, i.path, MAX(p.synced_at) AS last_shared, COUNT(*)::int AS links
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drive_items i ON i.drive_id = p.drive_id AND i.id = p.item_id
    WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL
      AND ${scopeFilter}
      AND ${typeFilter}
      ${searchClause}
    GROUP BY i.drive_id, i.id, i.name, i.web_url, i.path
    ORDER BY links DESC NULLS LAST
    LIMIT ${limitParam} OFFSET ${offsetParam}
    `,
    params
  );

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl">Sharing Drilldown</h2>
            <div className="text-sm text-slate">Scope: {scope} • Type: {type}</div>
          </div>
          <form method="get" className="flex flex-wrap gap-2">
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="type" value={type} />
            <input
              name="q"
              defaultValue={search || ""}
              placeholder="Search items"
              className="rounded-lg border border-slate/20 bg-white/80 px-3 py-2 text-sm"
            />
            <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">Search</button>
          </form>
        </div>
      </section>

      <section className="card p-6">
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">Links</th>
                <th className="py-2">Last Shared</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">
                      <Link className="underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                        {row.name || row.id}
                      </Link>
                    </div>
                    <div className="text-xs text-slate">{row.path || "--"}</div>
                  </td>
                  <td className="py-3 text-slate">{formatNumber(row.links)}</td>
                  <td className="py-3 text-slate">{formatDate(row.last_shared)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>No matching items.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
