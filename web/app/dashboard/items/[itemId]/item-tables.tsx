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

type AccessLinkRow = {
  permissionId: string;
  source: "direct" | "inherited";
  inheritedFromItemId: string | null;
  link_scope: string;
  link_type: string | null;
  link_webUrl: string | null;
  link_expiration: string | null;
  preventsDownload: boolean | null;
  roles: string[];
};

type PrincipalRow = {
  type: "user" | "group" | "siteGroup" | "application" | "link" | "unknown";
  id: string | null;
  displayName: string | null;
  email: string | null;
  classification: "guest" | "external" | "internal" | "unknown";
  grants: number;
  viaLinks: number;
  viaDirect: number;
};

type PermissionRow = {
  permissionId: string;
  source: "direct" | "inherited";
  inheritedFromItemId: string | null;
  link_scope: string | null;
  link_type: string | null;
  roles: string[];
  principalCount: number;
};

export function ItemLinkBreakdownTable({ breakdown }: { breakdown: LinkBreakdownRow[] }) {
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
        header: "Links",
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
      emptyMessage="No sharing links found for this item."
    />
  );
}

export function ItemAccessLinksTable({ links }: { links: AccessLinkRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "scope",
        header: "Scope",
        sortValue: (r: AccessLinkRow) => r.link_scope,
        cell: (r: AccessLinkRow) => <span className="text-muted-foreground">{r.link_scope}</span>,
      },
      {
        id: "type",
        header: "Type",
        sortValue: (r: AccessLinkRow) => r.link_type ?? "",
        cell: (r: AccessLinkRow) => <span className="text-muted-foreground">{r.link_type ?? "—"}</span>,
      },
      {
        id: "roles",
        header: "Roles",
        sortValue: (r: AccessLinkRow) => r.roles.join(","),
        cell: (r: AccessLinkRow) => <span className="text-muted-foreground">{r.roles.length ? r.roles.join(", ") : "—"}</span>,
      },
      {
        id: "expires",
        header: "Expires",
        sortValue: (r: AccessLinkRow) => r.link_expiration ?? "",
        cell: (r: AccessLinkRow) => <span className="text-muted-foreground">{formatIsoDateTime(r.link_expiration)}</span>,
      },
      {
        id: "url",
        header: "Link",
        sortValue: (r: AccessLinkRow) => r.link_webUrl ?? "",
        cell: (r: AccessLinkRow) => (
          <div className="max-w-[520px]">
            <div className="font-medium">
              {r.link_webUrl ? (
                <a className="hover:underline" href={r.link_webUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
            <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{r.link_webUrl ?? r.permissionId}</div>
          </div>
        ),
      },
    ],
    []
  );

  return <SortableTable items={links} columns={columns} getRowKey={(r) => r.permissionId} emptyMessage="No sharing link URLs found for this item." />;
}

function badgeForClassification(c: PrincipalRow["classification"]) {
  switch (c) {
    case "guest":
      return <Badge className="border-red-200 bg-red-50 text-red-700">Guest</Badge>;
    case "external":
      return <Badge className="border-amber-200 bg-amber-50 text-amber-800">External</Badge>;
    case "internal":
      return <Badge className="border-slate-200 bg-slate-50 text-slate-700">Internal</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

export function ItemPrincipalsTable({ principals }: { principals: PrincipalRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "principal",
        header: "Principal",
        sortValue: (p: PrincipalRow) => p.email ?? p.displayName ?? "",
        cell: (p: PrincipalRow) => (
          <div className="max-w-[520px]">
            <div className="font-medium">{p.email ?? p.displayName ?? p.id ?? "—"}</div>
            <div className="truncate text-xs text-muted-foreground">{p.displayName && p.email ? p.displayName : p.id}</div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        sortValue: (p: PrincipalRow) => p.type,
        cell: (p: PrincipalRow) => <span className="text-muted-foreground">{p.type}</span>,
      },
      {
        id: "class",
        header: "Class",
        sortValue: (p: PrincipalRow) => p.classification,
        cell: (p: PrincipalRow) => badgeForClassification(p.classification),
      },
      {
        id: "grants",
        header: "Grants",
        sortValue: (p: PrincipalRow) => p.grants,
        cell: (p: PrincipalRow) => <span className="text-muted-foreground">{p.grants.toLocaleString()}</span>,
      },
      {
        id: "viaLinks",
        header: "Via links",
        sortValue: (p: PrincipalRow) => p.viaLinks,
        cell: (p: PrincipalRow) => <span className="text-muted-foreground">{p.viaLinks.toLocaleString()}</span>,
      },
    ],
    []
  );

  return <SortableTable items={principals} columns={columns} getRowKey={(p) => `${p.type}:${p.id ?? p.email ?? p.displayName}`} emptyMessage="No principals found." />;
}

export function ItemPermissionsTable({ permissions }: { permissions: PermissionRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "perm",
        header: "Permission",
        sortValue: (p: PermissionRow) => p.permissionId,
        cell: (p: PermissionRow) => (
          <div className="max-w-[520px]">
            <div className="font-mono text-xs text-muted-foreground">{p.permissionId}</div>
            {p.inheritedFromItemId ? (
              <div className="text-xs text-muted-foreground">
                Inherited from{" "}
                <Link className="hover:underline" href={`/dashboard/items/${encodeURIComponent(p.inheritedFromItemId)}`}>
                  {p.inheritedFromItemId}
                </Link>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        sortValue: (p: PermissionRow) => p.source,
        cell: (p: PermissionRow) => <span className="text-muted-foreground">{p.source}</span>,
      },
      {
        id: "roles",
        header: "Roles",
        sortValue: (p: PermissionRow) => p.roles.join(","),
        cell: (p: PermissionRow) => <span className="text-muted-foreground">{p.roles.length ? p.roles.join(", ") : "—"}</span>,
      },
      {
        id: "link",
        header: "Link",
        sortValue: (p: PermissionRow) => `${p.link_scope ?? ""}:${p.link_type ?? ""}`,
        cell: (p: PermissionRow) => (
          <span className="text-muted-foreground">
            {p.link_scope ?? "—"} {p.link_type ? `(${p.link_type})` : ""}
          </span>
        ),
      },
      {
        id: "principals",
        header: "Principals",
        sortValue: (p: PermissionRow) => p.principalCount,
        cell: (p: PermissionRow) => <span className="text-muted-foreground">{p.principalCount.toLocaleString()}</span>,
      },
    ],
    []
  );

  return <SortableTable items={permissions} columns={columns} getRowKey={(p) => p.permissionId} emptyMessage="No permissions found." />;
}
