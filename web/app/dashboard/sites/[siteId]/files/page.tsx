import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatBytes, formatDate, formatNumber, safeDecode } from "@/app/lib/format";

function itemKey(driveId: string, itemId: string) {
  return encodeURIComponent(`${driveId}::${itemId}`);
}

export default async function SiteFilesPage({ params }: { params: { siteId: string } }) {
  await requireUser();

  const rawId = safeDecode(params.siteId);
  const siteRows = await query<any>("SELECT * FROM mv_msgraph_site_inventory WHERE site_key = $1", [rawId]);
  if (!siteRows.length) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Site not found</h2>
      </div>
    );
  }
  const site = siteRows[0];
  const isPersonal = site.is_personal === true;

  const heatmap = await query<any>(
    `
    SELECT EXTRACT(DOW FROM i.modified_dt)::int AS dow,
           EXTRACT(HOUR FROM i.modified_dt)::int AS hour,
           COUNT(*)::int AS count
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      AND i.modified_dt IS NOT NULL
    GROUP BY EXTRACT(DOW FROM i.modified_dt), EXTRACT(HOUR FROM i.modified_dt)
    ORDER BY dow, hour
    `,
    [site.site_id]
  );

  const recentlyModified = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, i.path, i.is_folder, i.size, i.modified_dt
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
    ORDER BY i.modified_dt DESC NULLS LAST
    LIMIT 25
    `,
    [site.site_id]
  );

  const largestFiles = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, i.path, i.size, i.modified_dt
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
      AND i.is_folder = false
    ORDER BY i.size DESC NULLS LAST
    LIMIT 25
    `,
    [site.site_id]
  );

  const mostShared = await query<any>(
    `
    SELECT
      i.drive_id,
      i.id,
      i.name,
      i.web_url,
      i.path,
      COUNT(p.permission_id)::int AS permissions,
      COUNT(*) FILTER (WHERE p.link_scope IS NOT NULL)::int AS sharing_links
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    LEFT JOIN msgraph_drive_item_permissions p
      ON p.drive_id = i.drive_id AND p.item_id = i.id AND p.deleted_at IS NULL
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
    GROUP BY i.drive_id, i.id, i.name, i.web_url, i.path
    ORDER BY sharing_links DESC NULLS LAST, permissions DESC NULLS LAST
    LIMIT 25
    `,
    [site.site_id]
  );

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl">{site.title || site.site_id} — Files</h2>
            <div className="text-sm text-slate">Write heatmap and high-signal file lists.</div>
          </div>
          <Link className="badge bg-white/70 text-slate hover:bg-white" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}`}>
            Back to Site
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="font-display text-xl">Write Heatmap</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Day</th>
                <th className="py-2">Hour</th>
                <th className="py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {heatmap.map((row: any) => (
                <tr key={`${row.dow}-${row.hour}`} className="border-t border-white/60">
                  <td className="py-2 text-slate">{row.dow}</td>
                  <td className="py-2 text-slate">{row.hour}</td>
                  <td className="py-2 text-ink font-semibold">{formatNumber(row.count)}</td>
                </tr>
              ))}
              {!heatmap.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>
                    No write activity recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Recently Modified</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Modified</th>
                </tr>
              </thead>
              <tbody>
                {recentlyModified.map((row: any) => (
                  <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                    <td className="py-3">
                      <div className="font-semibold text-ink">
                        <Link className="underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                          {row.name || row.id}
                        </Link>
                      </div>
                      <div className="text-xs text-slate">{row.path || "--"}</div>
                    </td>
                    <td className="py-3 text-slate">{formatDate(row.modified_dt)}</td>
                  </tr>
                ))}
                {!recentlyModified.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={2}>
                      No recent items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Largest Files</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Size</th>
                </tr>
              </thead>
              <tbody>
                {largestFiles.map((row: any) => (
                  <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                    <td className="py-3">
                      <div className="font-semibold text-ink">
                        <Link className="underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                          {row.name || row.id}
                        </Link>
                      </div>
                      <div className="text-xs text-slate">{row.path || "--"}</div>
                    </td>
                    <td className="py-3 text-slate">{formatBytes(row.size)}</td>
                  </tr>
                ))}
                {!largestFiles.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={2}>
                      No file size data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="font-display text-xl">Most Shared / Permissioned Items</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Item</th>
                <th className="py-2">Sharing Links</th>
                <th className="py-2">Permissions</th>
              </tr>
            </thead>
            <tbody>
              {mostShared.map((row: any) => (
                <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                  <td className="py-3">
                    <div className="font-semibold text-ink">
                      <Link className="underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                        {row.name || row.id}
                      </Link>
                    </div>
                    <div className="text-xs text-slate">{row.path || "--"}</div>
                  </td>
                  <td className="py-3 text-slate">{formatNumber(row.sharing_links)}</td>
                  <td className="py-3 text-slate">{formatNumber(row.permissions)}</td>
                </tr>
              ))}
              {!mostShared.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>
                    No sharing data.
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
