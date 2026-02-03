"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { formatIsoDateTime } from "@/app/lib/format";

type LinkBreakdownRow = {
  link_scope: string | null;
  link_type: string | null;
  count: number;
};

function toBreakdownParam(v: string | null): string {
  return v == null ? "null" : v;
}

type SiteRow = {
  site_key: string;
  title: string;
  last_shared_at: string | null;
  sharing_links: number;
  anonymous_links: number;
  distinctGuests: number;
  distinctExternalUsers: number;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function SharingLinkBreakdownTable({ breakdown }: { breakdown: LinkBreakdownRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "scope",
        header: "Scope",
        sortValue: (r: LinkBreakdownRow) => r.link_scope ?? "",
        cell: (r: LinkBreakdownRow) => (
          <Link
            className="text-muted-foreground hover:underline"
            href={`/dashboard/sharing/links?scope=${encodeURIComponent(toBreakdownParam(r.link_scope))}&type=${encodeURIComponent(
              toBreakdownParam(r.link_type)
            )}`}
          >
            {r.link_scope ?? "—"}
          </Link>
        ),
      },
      {
        id: "type",
        header: "Type",
        sortValue: (r: LinkBreakdownRow) => r.link_type ?? "",
        cell: (r: LinkBreakdownRow) => (
          <Link
            className="text-muted-foreground hover:underline"
            href={`/dashboard/sharing/links?scope=${encodeURIComponent(toBreakdownParam(r.link_scope))}&type=${encodeURIComponent(
              toBreakdownParam(r.link_type)
            )}`}
          >
            {r.link_type ?? "—"}
          </Link>
        ),
      },
      {
        id: "count",
        header: "Count",
        sortValue: (r: LinkBreakdownRow) => r.count,
        cell: (r: LinkBreakdownRow) => <span className="text-muted-foreground">{r.count.toLocaleString()}</span>,
      },
    ],
    []
  );

  return (
    <SortableTable
      mode="client"
      items={breakdown}
      columns={columns}
      getRowKey={(r, idx) => `${r.link_scope ?? "null"}:${r.link_type ?? "null"}:${idx}`}
      emptyMessage="No link data found."
    />
  );
}

export function SharingSitesTable({
  sites,
  externalThreshold,
}: {
  sites: SiteRow[];
  externalThreshold: number;
}) {
  const columns = React.useMemo(
    () => [
      {
        id: "site",
        header: "Site",
        sortValue: (s: SiteRow) => s.title,
        cell: (s: SiteRow) => {
          const oversharing = externalThreshold > 0 && s.distinctExternalUsers >= externalThreshold;
          return (
            <div className="flex flex-col gap-1">
              <Link className="font-medium hover:underline" href={`/dashboard/sites/${encodeURIComponent(s.site_key)}/sharing`}>
                {s.title}
              </Link>
              <div className="flex flex-wrap items-center gap-1">
                {oversharing ? <Badge variant="outline">Oversharing</Badge> : null}
                {s.anonymous_links > 0 ? <Badge variant="outline">Anonymous</Badge> : null}
              </div>
            </div>
          );
        },
        cellClassName: "max-w-[420px]",
      },
      {
        id: "links",
        header: "Links",
        sortValue: (s: SiteRow) => s.sharing_links,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.sharing_links.toLocaleString()}</span>,
      },
      {
        id: "anonymous",
        header: "Anonymous",
        sortValue: (s: SiteRow) => s.anonymous_links,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.anonymous_links.toLocaleString()}</span>,
      },
      {
        id: "guests",
        header: "Guests",
        sortValue: (s: SiteRow) => s.distinctGuests,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.distinctGuests.toLocaleString()}</span>,
      },
      {
        id: "external",
        header: "External",
        sortValue: (s: SiteRow) => s.distinctExternalUsers,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.distinctExternalUsers.toLocaleString()}</span>,
      },
      {
        id: "lastShare",
        header: "Last link share seen",
        sortValue: (s: SiteRow) => parseIsoToTs(s.last_shared_at),
        cell: (s: SiteRow) => <span className="text-muted-foreground">{formatIsoDateTime(s.last_shared_at)}</span>,
      },
    ],
    [externalThreshold]
  );

  return (
    <SortableTable
      mode="server"
      items={sites}
      columns={columns}
      getRowKey={(s) => s.site_key}
      emptyMessage="No sites matched your search."
    />
  );
}
