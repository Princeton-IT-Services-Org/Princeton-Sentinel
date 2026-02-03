import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate, formatNumber, safeDecode } from "@/app/lib/format";
import { getPagination, getWindowDays, SearchParams } from "@/app/lib/params";

function itemKey(driveId: string, itemId: string) {
  return encodeURIComponent(`${driveId}::${itemId}`);
}

export default async function UserDetailPage({ params, searchParams }: { params: { userId: string }; searchParams?: SearchParams }) {
  await requireUser();

  const userId = safeDecode(params.userId);
  const windowDays = getWindowDays(searchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 25 });

  const userRows = await query<any>(
    `SELECT id, display_name, mail, user_principal_name FROM msgraph_users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const user = userRows[0];

  const summaryRows = await query<any>(
    `
    SELECT
      COUNT(*)::int AS modified_items,
      COUNT(DISTINCT COALESCE(d.site_id, d.id))::int AS sites_touched,
      MAX(i.modified_dt) AS last_modified_dt
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND i.last_modified_by_user_id = $1
      ${windowStart ? "AND i.modified_dt >= $2" : ""}
    `,
    windowStart ? [userId, windowStart] : [userId]
  );

  const topSites = await query<any>(
    `
    SELECT
      CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
      COUNT(*)::int AS modified_items
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND i.last_modified_by_user_id = $1
      ${windowStart ? "AND i.modified_dt >= $2" : ""}
    GROUP BY CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
    ORDER BY modified_items DESC
    LIMIT 10
    `,
    windowStart ? [userId, windowStart] : [userId]
  );

  const topSitesWithNames = await query<any>(
    `
    SELECT s.site_key, s.title, t.modified_items
    FROM (
      SELECT
        CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
        COUNT(*)::int AS modified_items
      FROM msgraph_drive_items i
      JOIN msgraph_drives d ON d.id = i.drive_id
      WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
        AND i.last_modified_by_user_id = $1
        ${windowStart ? "AND i.modified_dt >= $2" : ""}
      GROUP BY CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
      ORDER BY modified_items DESC
      LIMIT 10
    ) t
    LEFT JOIN mv_msgraph_site_inventory s ON s.site_key = t.site_key
    ORDER BY t.modified_items DESC
    `,
    windowStart ? [userId, windowStart] : [userId]
  );

  const recentItems = await query<any>(
    `
    SELECT
      i.drive_id,
      i.id,
      i.name,
      i.web_url,
      i.modified_dt,
      CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND i.last_modified_by_user_id = $1
      ${windowStart ? "AND i.modified_dt >= $2" : ""}
    ORDER BY i.modified_dt DESC NULLS LAST
    LIMIT $${windowStart ? 3 : 2} OFFSET $${windowStart ? 4 : 3}
    `,
    windowStart ? [userId, windowStart, pageSize, offset] : [userId, pageSize, offset]
  );

  const summary = summaryRows[0] || {};

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl">{user?.display_name || user?.user_principal_name || user?.mail || userId}</h2>
            <div className="text-sm text-slate">{user?.mail || user?.user_principal_name}</div>
            <div className="text-xs text-slate">User ID: {userId}</div>
          </div>
          <Link className="badge bg-white/70 text-slate hover:bg-white" href="/dashboard/users">
            Back to Users
          </Link>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-4">
        <div className="card p-6">
          <div className="text-sm text-slate">Items modified ({windowDays || "all"}d)</div>
          <div className="text-3xl font-semibold text-ink">{formatNumber(summary.modified_items || 0)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Sites touched</div>
          <div className="text-3xl font-semibold text-ink">{formatNumber(summary.sites_touched || 0)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Last modified</div>
          <div className="text-xl font-semibold text-ink">{formatDate(summary.last_modified_dt)}</div>
        </div>
        <div className="card p-6">
          <div className="text-sm text-slate">Last sign-in</div>
          <div className="text-xl font-semibold text-ink">--</div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Top Sites</h3>
          <div className="mt-4 grid gap-2 text-sm">
            {(topSitesWithNames.length ? topSitesWithNames : topSites).map((row: any) => (
              <div key={row.site_key} className="flex items-center justify-between">
                <Link className="text-ink underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                  {row.title || row.site_key}
                </Link>
                <span className="font-semibold text-slate">{formatNumber(row.modified_items)}</span>
              </div>
            ))}
            {!topSites.length && <div className="text-sm text-slate">No site activity.</div>}
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Recently Modified Items</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Modified</th>
                </tr>
              </thead>
              <tbody>
                {recentItems.map((row: any) => (
                  <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                    <td className="py-3">
                      <Link className="font-semibold text-ink underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                        {row.name || row.id}
                      </Link>
                      <div className="text-xs text-slate">
                        <Link className="underline decoration-dotted" href={`/dashboard/sites/${encodeURIComponent(row.site_key)}`}>
                          View site
                        </Link>
                      </div>
                    </td>
                    <td className="py-3 text-slate">{formatDate(row.modified_dt)}</td>
                  </tr>
                ))}
                {!recentItems.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={2}>No recent items.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
