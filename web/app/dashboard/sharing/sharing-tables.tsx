"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { InfoTooltip } from "@/components/info-tooltip";
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
  route_drive_id: string;
  title: string;
  web_url: string | null;
  last_shared_at: string | null;
  sharing_links: number;
  anonymous_links: number;
  guestUsers: number;
  externalUsers: number;
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
}: {
  sites: SiteRow[];
}) {
  const columns = React.useMemo(
    () => [
      {
        id: "site",
        header: "Site",
        headerInfo: <InfoTooltip label="The specific routable drive row that opens the linked site sharing page." />,
        sortValue: (s: SiteRow) => s.title,
        cell: (s: SiteRow) => (
          <div className="flex flex-col gap-1">
            <Link className="font-medium hover:underline" href={`/sites/${encodeURIComponent(s.route_drive_id)}/sharing`}>
              {s.title || s.route_drive_id}
            </Link>
            {s.web_url ? (
              <a className="truncate text-xs text-muted-foreground hover:underline" href={s.web_url} target="_blank" rel="noreferrer">
                {s.web_url}
              </a>
            ) : (
              <span className="truncate text-xs text-muted-foreground">{s.route_drive_id}</span>
            )}
          </div>
        ),
        cellClassName: "max-w-[420px]",
      },
      {
        id: "links",
        header: "Sharing links",
        headerInfo: <InfoTooltip label="Permission records on this route drive where link_scope is present." />,
        sortValue: (s: SiteRow) => s.sharing_links,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.sharing_links.toLocaleString()}</span>,
      },
      {
        id: "anonymous",
        header: "Anonymous links",
        headerInfo: <InfoTooltip label="Sharing-link permissions on this route drive where link_scope is anonymous." />,
        sortValue: (s: SiteRow) => s.anonymous_links,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.anonymous_links.toLocaleString()}</span>,
      },
      {
        id: "guests",
        header: "Guest users",
        headerInfo: <InfoTooltip label="Distinct granted email identities on this route drive containing #EXT#." />,
        sortValue: (s: SiteRow) => s.guestUsers,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.guestUsers.toLocaleString()}</span>,
      },
      {
        id: "external",
        header: "External users",
        headerInfo: (
          <InfoTooltip label="Distinct granted email identities on this route drive outside configured internal domains, excluding guest-style identities." />
        ),
        sortValue: (s: SiteRow) => s.externalUsers,
        cell: (s: SiteRow) => <span className="text-muted-foreground">{s.externalUsers.toLocaleString()}</span>,
      },
      {
        id: "lastShare",
        header: "Last permission sync seen",
        headerInfo: <InfoTooltip label="Latest cached permission sync timestamp found for this route drive." />,
        sortValue: (s: SiteRow) => parseIsoToTs(s.last_shared_at),
        cell: (s: SiteRow) => <span className="text-muted-foreground">{formatIsoDateTime(s.last_shared_at)}</span>,
      },
    ],
    []
  );

  return (
    <SortableTable
      mode="server"
      items={sites}
      columns={columns}
      getRowKey={(s) => s.route_drive_id}
      emptyMessage="No sites matched your search."
    />
  );
}
