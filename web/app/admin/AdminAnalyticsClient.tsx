"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LocalDateTime from "@/components/local-date-time";

type AnalyticsPayload = {
  inventory?: Record<string, any>;
  sharing?: Record<string, any>;
  refresh?: Array<{ mv_name: string; last_refreshed_at: string }>;
};

const REFRESH_INTERVAL_MS = 5000;

function toRefreshMap(refresh: Array<{ mv_name: string; last_refreshed_at: string }> = []) {
  const map = new Map<string, string>();
  for (const row of refresh) {
    map.set(row.mv_name, row.last_refreshed_at);
  }
  return map;
}

export default function AdminAnalyticsClient({ initialData }: { initialData: AnalyticsPayload }) {
  const [inventory, setInventory] = useState<Record<string, any>>(initialData.inventory || {});
  const [sharing, setSharing] = useState<Record<string, any>>(initialData.sharing || {});
  const [refreshRows, setRefreshRows] = useState<Array<{ mv_name: string; last_refreshed_at: string }>>(initialData.refresh || []);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const refreshMap = useMemo(() => toRefreshMap(refreshRows), [refreshRows]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/analytics", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AnalyticsPayload;
        if (cancelled) return;
        setInventory(data.inventory || {});
        setSharing(data.sharing || {});
        setRefreshRows(Array.isArray(data.refresh) ? data.refresh : []);
        setLastUpdatedAt(new Date().toLocaleString());
        setRefreshError(null);
      } catch (err: any) {
        if (cancelled) return;
        setRefreshError(err?.message || "Failed to refresh");
      }
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="grid gap-4">
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Live</span>: refreshes every 5s
        </div>
        <div className="text-right">
          {refreshError ? (
            <span className="text-red-700">Refresh failed: {refreshError}</span>
          ) : lastUpdatedAt ? (
            <span>Updated {lastUpdatedAt}</span>
          ) : (
            <span />
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Inventory Summary</CardTitle>
          <span className="text-xs uppercase tracking-[0.3em] text-slate/60">
            Cached (DB) -- Last refreshed at <LocalDateTime value={refreshMap.get("mv_msgraph_inventory_summary")} />
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
            Cached (DB) -- Last refreshed at <LocalDateTime value={refreshMap.get("mv_msgraph_sharing_posture_summary")} />
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
