import { query } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LocalDateTime from "@/components/local-date-time";

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
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Inventory Summary</CardTitle>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">
            Cached (DB) -- Last refreshed at{" "}
            <LocalDateTime value={refreshMap.get("mv_msgraph_inventory_summary")} />
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Users</div>
              <div className="text-2xl font-semibold text-ink">{inventory.users_total || 0}</div>
              <div className="text-xs text-slate">Soft-deleted: {inventory.users_deleted || 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Groups</div>
              <div className="text-2xl font-semibold text-ink">{inventory.groups_total || 0}</div>
              <div className="text-xs text-slate">Soft-deleted: {inventory.groups_deleted || 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Sites</div>
              <div className="text-2xl font-semibold text-ink">{inventory.sites_total || 0}</div>
              <div className="text-xs text-slate">Soft-deleted: {inventory.sites_deleted || 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Drives</div>
              <div className="text-2xl font-semibold text-ink">{inventory.drives_total || 0}</div>
              <div className="text-xs text-slate">Soft-deleted: {inventory.drives_deleted || 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Drive Items</div>
              <div className="text-2xl font-semibold text-ink">{inventory.drive_items_total || 0}</div>
              <div className="text-xs text-slate">Soft-deleted: {inventory.drive_items_deleted || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Sharing Posture</CardTitle>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">
            Cached (DB) -- Last refreshed at{" "}
            <LocalDateTime value={refreshMap.get("mv_msgraph_sharing_posture_summary")} />
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Permissions</div>
              <div className="text-2xl font-semibold text-ink">{sharing.permissions_total || 0}</div>
              <div className="text-xs text-slate">Items with permissions: {sharing.items_with_permissions || 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Anonymous Links</div>
              <div className="text-2xl font-semibold text-ink">{sharing.anonymous_links || 0}</div>
              <div className="text-xs text-slate">Org links: {sharing.organization_links || 0}</div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm text-slate">Direct Shares</div>
              <div className="text-2xl font-semibold text-ink">{sharing.direct_shares || 0}</div>
              <div className="text-xs text-slate">Guest grants: {sharing.guest_grants || 0}</div>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate">
            Live (Graph) drill-down endpoints are available via the API routes for verification without modifying cached data.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
