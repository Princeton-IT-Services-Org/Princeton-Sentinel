import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardTotalsBarChartClient } from "@/components/dashboard-totals-bar-chart-client";
import { SharingSummaryBarChartClient, SharingSummaryPieChartClient } from "@/components/sharing-summary-graphs-client";
import { formatBytes } from "@/app/lib/format";
import { query } from "@/app/lib/db";
import { requireUser } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();

  const inventoryRows = await query<any>("SELECT * FROM mv_msgraph_inventory_summary LIMIT 1");
  const linkBreakdownRows = await query<any>("SELECT link_scope, link_type, count FROM mv_msgraph_link_breakdown");
  const driveTotalsRows = await query<any>("SELECT * FROM mv_msgraph_drive_storage_totals LIMIT 1");
  const driveTypeRows = await query<any>("SELECT drive_type, count FROM mv_msgraph_drive_type_counts ORDER BY count DESC");
  const topDrivesRows = await query<any>("SELECT drive_id, name, drive_type, web_url, quota_used, quota_total FROM mv_msgraph_drive_top_used ORDER BY rank ASC");

  const inventory = inventoryRows[0] || {};
  const driveTotals = driveTotalsRows[0] || {};

  const chartTotals = {
    sites: Number(inventory.sites_total || 0),
    users: Number(inventory.users_total || 0),
    groups: Number(inventory.groups_total || 0),
    drives: Number(inventory.drives_total || 0),
  };

  const linkScopeCounts = new Map<string, number>();
  for (const r of linkBreakdownRows) {
    const scope = r.link_scope ?? "unknown";
    linkScopeCounts.set(scope, (linkScopeCounts.get(scope) ?? 0) + Number(r.count ?? 0));
  }
  const linkScopePie = Array.from(linkScopeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }));

  const driveTypePie = driveTypeRows.map((r: any) => ({
    label: r.drive_type ?? "unknown",
    value: Number(r.count ?? 0),
  }));

  const topDrives = topDrivesRows
    .filter((d: any) => typeof d.quota_used === "number" && Number.isFinite(d.quota_used))
    .slice(0, 10)
    .map((d: any) => ({
      label: d.name ?? d.drive_id,
      value: (d.quota_used ?? 0) / 1024 / 1024 / 1024,
    }));

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">High-level posture signals from directory, storage, and sharing metadata.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-md">
          <CardHeader>
            <CardTitle>Directory totals</CardTitle>
            <CardDescription>Sites, users, groups, drives</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <DashboardTotalsBarChartClient totals={chartTotals} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-md">
          <CardHeader>
            <CardTitle>Sharing link scopes</CardTitle>
            <CardDescription>Current link inventory (direct permissions)</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <SharingSummaryPieChartClient data={linkScopePie} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-md">
          <CardHeader>
            <CardTitle>Drive types</CardTitle>
            <CardDescription>Where content lives</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <SharingSummaryPieChartClient data={driveTypePie} />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-md">
          <CardHeader>
            <CardTitle>Top drives by used storage</CardTitle>
            <CardDescription>
              Total {formatBytes(driveTotals.storage_used)} / {formatBytes(driveTotals.storage_total)}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72 flex items-center">
            <SharingSummaryBarChartClient data={topDrives} label="Used (GB)" xTitle="GB" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
