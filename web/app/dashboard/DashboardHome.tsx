import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatBytes, formatDate, formatNumber } from "@/app/lib/format";

export default async function DashboardHome() {
  await requireUser();

  const inventoryRows = await query<any>("SELECT * FROM mv_msgraph_inventory_summary LIMIT 1");
  const refreshRows = await query<any>("SELECT mv_name, last_refreshed_at FROM mv_refresh_log");
  const driveTypeRows = await query<any>(
    `
    SELECT drive_type, COUNT(*) AS count
    FROM msgraph_drives
    WHERE deleted_at IS NULL
    GROUP BY drive_type
    ORDER BY count DESC
    `
  );
  const driveTotals = await query<any>(
    `
    SELECT SUM(quota_used) AS storage_used, SUM(quota_total) AS storage_total
    FROM msgraph_drives
    WHERE deleted_at IS NULL
    `
  );
  const topDrives = await query<any>(
    `
    SELECT id, name, drive_type, web_url, quota_used, quota_total
    FROM msgraph_drives
    WHERE deleted_at IS NULL
    ORDER BY quota_used DESC NULLS LAST
    LIMIT 10
    `
  );
  const linkBreakdown = await query<any>(
    `
    SELECT link_scope, link_type, COUNT(*) AS count
    FROM msgraph_drive_item_permissions
    WHERE deleted_at IS NULL
    GROUP BY link_scope, link_type
    ORDER BY count DESC
    LIMIT 20
    `
  );

  const inventory = inventoryRows[0] || {};
  const refreshMap = new Map<string, string>();
  for (const row of refreshRows) {
    refreshMap.set(row.mv_name, row.last_refreshed_at);
  }
  const totals = driveTotals[0] || {};

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Directory Overview</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">
            Cached (DB) -- Last refreshed at {formatDate(refreshMap.get("mv_msgraph_inventory_summary"))}
          </span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Users</div>
            <div className="text-2xl font-semibold text-ink">{formatNumber(inventory.users_total || 0)}</div>
            <div className="text-xs text-slate">Soft-deleted: {formatNumber(inventory.users_deleted || 0)}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Groups</div>
            <div className="text-2xl font-semibold text-ink">{formatNumber(inventory.groups_total || 0)}</div>
            <div className="text-xs text-slate">Soft-deleted: {formatNumber(inventory.groups_deleted || 0)}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Sites</div>
            <div className="text-2xl font-semibold text-ink">{formatNumber(inventory.sites_total || 0)}</div>
            <div className="text-xs text-slate">Soft-deleted: {formatNumber(inventory.sites_deleted || 0)}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Drives</div>
            <div className="text-2xl font-semibold text-ink">{formatNumber(inventory.drives_total || 0)}</div>
            <div className="text-xs text-slate">Soft-deleted: {formatNumber(inventory.drives_deleted || 0)}</div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Storage Overview</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">Cached (DB)</span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Total Used</div>
            <div className="text-2xl font-semibold text-ink">{formatBytes(totals.storage_used)}</div>
            <div className="text-xs text-slate">Total Allocated: {formatBytes(totals.storage_total)}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4 md:col-span-2">
            <div className="text-sm text-slate">Drive Types</div>
            <div className="mt-3 grid gap-2">
              {driveTypeRows.map((row: any) => (
                <div key={row.drive_type || "unknown"} className="flex items-center justify-between text-sm">
                  <span className="text-ink">{row.drive_type || "unknown"}</span>
                  <span className="font-semibold text-slate">{formatNumber(row.count)}</span>
                </div>
              ))}
              {!driveTypeRows.length && <div className="text-sm text-slate">No drive data yet.</div>}
            </div>
          </div>
        </div>
        <div className="mt-6">
          <div className="text-sm text-slate">Top drives by used storage</div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Drive</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Used</th>
                  <th className="py-2">Allocated</th>
                </tr>
              </thead>
              <tbody>
                {topDrives.map((drive: any) => (
                  <tr key={drive.id} className="border-t border-white/60">
                    <td className="py-3 font-semibold text-ink">
                      {drive.web_url ? (
                        <a className="text-ink underline decoration-dotted" href={drive.web_url} target="_blank" rel="noreferrer">
                          {drive.name || drive.id}
                        </a>
                      ) : (
                        drive.name || drive.id
                      )}
                    </td>
                    <td className="py-3 text-slate">{drive.drive_type || "--"}</td>
                    <td className="py-3 text-slate">{formatBytes(drive.quota_used)}</td>
                    <td className="py-3 text-slate">{formatBytes(drive.quota_total)}</td>
                  </tr>
                ))}
                {!topDrives.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={4}>
                      No drive usage data available yet.
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
          <h2 className="font-display text-2xl">Sharing Link Breakdown</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">Cached (DB)</span>
        </div>
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
              {linkBreakdown.map((row: any) => (
                <tr key={`${row.link_scope || "null"}-${row.link_type || "null"}`} className="border-t border-white/60">
                  <td className="py-3 text-ink">{row.link_scope || "(direct)"}</td>
                  <td className="py-3 text-slate">{row.link_type || "--"}</td>
                  <td className="py-3 text-slate">{formatNumber(row.count)}</td>
                </tr>
              ))}
              {!linkBreakdown.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>
                    No sharing data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-4 text-xs text-slate">Live (Graph) drill-down is available from item and sharing pages.</div>
      </section>
    </div>
  );
}
