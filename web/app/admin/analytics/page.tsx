import { query } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/auth";
import { formatDate } from "@/app/lib/format";

export default async function AnalyticsPage() {
  await requireAdmin();

  const inventoryRows = await query<any>("SELECT * FROM mv_msgraph_inventory_summary LIMIT 1");
  const sharingRows = await query<any>("SELECT * FROM mv_msgraph_sharing_posture_summary LIMIT 1");
  const refreshRows = await query<any>("SELECT mv_name, last_refreshed_at FROM mv_refresh_log");

  const inventory = inventoryRows[0] || {};
  const sharing = sharingRows[0] || {};
  const refreshMap = new Map<string, string>();
  for (const row of refreshRows) {
    refreshMap.set(row.mv_name, row.last_refreshed_at);
  }

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Inventory Summary</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">
            Cached (DB) -- Last refreshed at {formatDate(refreshMap.get("mv_msgraph_inventory_summary"))}
          </span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Users</div>
            <div className="text-2xl font-semibold text-ink">{inventory.users_total || 0}</div>
            <div className="text-xs text-slate">Soft-deleted: {inventory.users_deleted || 0}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Groups</div>
            <div className="text-2xl font-semibold text-ink">{inventory.groups_total || 0}</div>
            <div className="text-xs text-slate">Soft-deleted: {inventory.groups_deleted || 0}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Sites</div>
            <div className="text-2xl font-semibold text-ink">{inventory.sites_total || 0}</div>
            <div className="text-xs text-slate">Soft-deleted: {inventory.sites_deleted || 0}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Drives</div>
            <div className="text-2xl font-semibold text-ink">{inventory.drives_total || 0}</div>
            <div className="text-xs text-slate">Soft-deleted: {inventory.drives_deleted || 0}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Drive Items</div>
            <div className="text-2xl font-semibold text-ink">{inventory.drive_items_total || 0}</div>
            <div className="text-xs text-slate">Soft-deleted: {inventory.drive_items_deleted || 0}</div>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Sharing Posture</h2>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">
            Cached (DB) -- Last refreshed at {formatDate(refreshMap.get("mv_msgraph_sharing_posture_summary"))}
          </span>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Permissions</div>
            <div className="text-2xl font-semibold text-ink">{sharing.permissions_total || 0}</div>
            <div className="text-xs text-slate">Items with permissions: {sharing.items_with_permissions || 0}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Anonymous Links</div>
            <div className="text-2xl font-semibold text-ink">{sharing.anonymous_links || 0}</div>
            <div className="text-xs text-slate">Org links: {sharing.organization_links || 0}</div>
          </div>
          <div className="rounded-xl bg-white/60 p-4">
            <div className="text-sm text-slate">Direct Shares</div>
            <div className="text-2xl font-semibold text-ink">{sharing.direct_shares || 0}</div>
            <div className="text-xs text-slate">Guest grants: {sharing.guest_grants || 0}</div>
          </div>
        </div>
        <div className="mt-4 text-xs text-slate">
          Live (Graph) drill-down endpoints are available via the API routes for verification without modifying cached data.
        </div>
      </section>
    </div>
  );
}
