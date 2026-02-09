"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatIsoDateTime } from "@/app/lib/format";

type LinkBreakdownRow = {
  link_scope: string | null;
  link_type: string | null;
  count: number;
};

type ExternalPrincipalRow = {
  email: string;
  type: string;
  grants: number;
  lastGrantedDateTime: string | null;
};

type MostSharedItemRow = {
  itemId: string;
  name: string;
  webUrl: string | null;
  sharingLinks: number;
  permissions: number;
  lastSharedDateTime: string | null;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function SiteSharingLinkBreakdownTable({ breakdown }: { breakdown: LinkBreakdownRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "scope",
        header: "Scope",
        sortValue: (r: LinkBreakdownRow) => r.link_scope ?? "",
        cell: (r: LinkBreakdownRow) => <span className="text-muted-foreground">{r.link_scope ?? "—"}</span>,
      },
      {
        id: "type",
        header: "Type",
        sortValue: (r: LinkBreakdownRow) => r.link_type ?? "",
        cell: (r: LinkBreakdownRow) => <span className="text-muted-foreground">{r.link_type ?? "—"}</span>,
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
      items={breakdown}
      columns={columns}
      getRowKey={(r, idx) => `${r.link_scope ?? "null"}:${r.link_type ?? "null"}:${idx}`}
      emptyMessage="No sharing links found."
    />
  );
}

export function SiteExternalPrincipalsTable({ principals }: { principals: ExternalPrincipalRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "email",
        header: "Email",
        sortValue: (p: ExternalPrincipalRow) => p.email,
        cell: (p: ExternalPrincipalRow) => <span className="text-muted-foreground">{p.email}</span>,
      },
      {
        id: "type",
        header: "Type",
        sortValue: (p: ExternalPrincipalRow) => p.type,
        cell: (p: ExternalPrincipalRow) => <span className="text-muted-foreground">{p.type}</span>,
      },
      {
        id: "grants",
        header: "Grants",
        sortValue: (p: ExternalPrincipalRow) => p.grants,
        cell: (p: ExternalPrincipalRow) => <span className="text-muted-foreground">{p.grants.toLocaleString()}</span>,
      },
      {
        id: "lastGranted",
        header: "Last grant seen",
        sortValue: (p: ExternalPrincipalRow) => parseIsoToTs(p.lastGrantedDateTime),
        cell: (p: ExternalPrincipalRow) => <span className="text-muted-foreground">{formatIsoDateTime(p.lastGrantedDateTime)}</span>,
      },
    ],
    []
  );

  return (
    <SortableTable
      items={principals}
      columns={columns}
      getRowKey={(p) => `${p.type}:${p.email}`}
      emptyMessage="No external principals found."
    />
  );
}

export function SiteMostSharedItemsTable({ items }: { items: MostSharedItemRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (it: MostSharedItemRow) => it.name,
        cell: (it: MostSharedItemRow) => (
          <div className="max-w-[560px]">
            <div className="font-medium">
              {it.webUrl ? (
                <a className="hover:underline" href={it.webUrl} target="_blank" rel="noreferrer">
                  {it.name}
                </a>
              ) : (
                <span>{it.name}</span>
              )}
            </div>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <Link className="hover:underline" href={`/dashboard/items/${encodeURIComponent(it.itemId)}`}>
                Details
              </Link>
              {it.webUrl ? (
                <a className="hover:underline" href={it.webUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
            </div>
            <div className="truncate text-xs text-muted-foreground">{it.itemId}</div>
          </div>
        ),
      },
      {
        id: "sharingLinks",
        header: "Sharing links",
        sortValue: (it: MostSharedItemRow) => it.sharingLinks,
        cell: (it: MostSharedItemRow) => <span className="text-muted-foreground">{it.sharingLinks.toLocaleString()}</span>,
      },
      {
        id: "permissions",
        header: "Permissions",
        sortValue: (it: MostSharedItemRow) => it.permissions,
        cell: (it: MostSharedItemRow) => <span className="text-muted-foreground">{it.permissions.toLocaleString()}</span>,
      },
      {
        id: "lastShared",
        header: "Last link share seen",
        sortValue: (it: MostSharedItemRow) => parseIsoToTs(it.lastSharedDateTime),
        cell: (it: MostSharedItemRow) => <span className="text-muted-foreground">{formatIsoDateTime(it.lastSharedDateTime)}</span>,
      },
    ],
    []
  );

  return <SortableTable items={items} columns={columns} getRowKey={(it) => it.itemId} emptyMessage="No item-level sharing found." />;
}
