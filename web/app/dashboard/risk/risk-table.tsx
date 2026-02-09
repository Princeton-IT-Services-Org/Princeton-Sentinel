"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatIsoDateTime } from "@/app/lib/format";

type RiskRow = {
  site_key: string;
  route_drive_id: string;
  title: string;
  web_url: string | null;
  storage_used_bytes: number | null;
  storage_total_bytes: number | null;
  last_activity_dt: string | null;
  dormant: boolean;
  anonymousLinksSignal: boolean;
  orgLinksSignal: boolean;
  externalUsersSignal: boolean;
  guestUsersSignal: boolean;
  sharing_links: number;
  anonymous_links: number;
  organization_links: number;
  guest_users: number;
  external_users: number;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function RiskTable({ items }: { items: RiskRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "site",
        header: "Site",
        sortValue: (s: RiskRow) => s.title,
        cell: (s: RiskRow) => (
          <div>
            <Link className="font-medium hover:underline" href={`/sites/${encodeURIComponent(s.route_drive_id)}`}>
              {s.title}
            </Link>
            {s.web_url ? (
              <div className="truncate text-xs text-muted-foreground">{s.web_url}</div>
            ) : (
              <div className="truncate text-xs text-muted-foreground">{s.site_key}</div>
            )}
          </div>
        ),
        cellClassName: "max-w-[520px]",
      },
      {
        id: "flags",
        header: "Signals",
        sortValue: (s: RiskRow) =>
          Number(s.dormant) +
          Number(s.anonymousLinksSignal) +
          Number(s.orgLinksSignal) +
          Number(s.externalUsersSignal) +
          Number(s.guestUsersSignal),
        cell: (s: RiskRow) => (
          <div className="space-x-1">
            {s.dormant ? <Badge variant="outline">Dormant</Badge> : null}
            {s.anonymousLinksSignal ? <Badge variant="outline">Anonymous links</Badge> : null}
            {s.orgLinksSignal ? <Badge variant="outline">Org-wide links</Badge> : null}
            {s.externalUsersSignal ? <Badge variant="outline">External users</Badge> : null}
            {s.guestUsersSignal ? <Badge variant="outline">Guests</Badge> : null}
          </div>
        ),
      },
      {
        id: "exposure",
        header: "Exposure",
        sortValue: (s: RiskRow) => s.anonymous_links + s.organization_links + s.external_users + s.guest_users,
        cell: (s: RiskRow) => (
          <div className="text-sm text-muted-foreground">
            <div>
              Links:{" "}
              <span className="font-medium text-foreground">
                {Number(s.sharing_links ?? 0).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">
                (anon {Number(s.anonymous_links ?? 0).toLocaleString()}, org{" "}
                {Number(s.organization_links ?? 0).toLocaleString()})
              </span>
            </div>
            <div>
              Principals:{" "}
              <span className="font-medium text-foreground">
                {(Number(s.guest_users ?? 0) + Number(s.external_users ?? 0)).toLocaleString()}
              </span>{" "}
              <span className="text-muted-foreground">
                (guest {Number(s.guest_users ?? 0).toLocaleString()}, external{" "}
                {Number(s.external_users ?? 0).toLocaleString()})
              </span>
            </div>
          </div>
        ),
      },
      {
        id: "storage",
        header: "Storage",
        sortValue: (s: RiskRow) => s.storage_used_bytes,
        cell: (s: RiskRow) => (
          <span className="text-muted-foreground">
            {formatBytes(s.storage_used_bytes)} / {formatBytes(s.storage_total_bytes)}
          </span>
        ),
      },
      {
        id: "lastActivity",
        header: "Last activity",
        sortValue: (s: RiskRow) => parseIsoToTs(s.last_activity_dt),
        cell: (s: RiskRow) => <span className="text-muted-foreground">{formatIsoDateTime(s.last_activity_dt)}</span>,
      },
    ],
    []
  );

  return (
    <SortableTable
      mode="server"
      items={items}
      columns={columns}
      getRowKey={(s) => s.site_key}
      emptyMessage="No risk signals found in the current sample."
    />
  );
}
