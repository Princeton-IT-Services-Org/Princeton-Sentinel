"use client";

import Link from "next/link";
import * as React from "react";
import { useRouter } from "next/navigation";

import { SortableTable } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  directPermissionIds: string[];
};

type PermissionRow = {
  permissionId: string;
  source: "direct" | "inherited";
  inheritedFromItemId: string | null;
  link_scope: string | null;
  link_type: string | null;
  roles: string[];
  principalCount: number;
  isOwnerRole: boolean;
};

async function errorMessageFromResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (text) {
      try {
        const data = JSON.parse(text);
        if (data?.error) return String(data.error);
      } catch {
        // ignore parse errors
      }
      return text;
    }
  } catch {
    // ignore read errors
  }
  return `Request failed with status ${res.status}`;
}

async function deletePermission(driveId: string, itemId: string, permissionId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/graph/drive-item-permissions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveId, itemId, permissionId }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await errorMessageFromResponse(res) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Request failed" };
  }
}

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

export function ItemPrincipalsTable({
  principals,
  isAdmin,
  driveId,
  itemId,
}: {
  principals: PrincipalRow[];
  isAdmin: boolean;
  driveId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = React.useState<Record<string, boolean>>({});

  const rowKey = React.useCallback(
    (p: PrincipalRow) => `${p.type}:${p.id ?? p.email ?? p.displayName ?? "unknown"}`,
    []
  );

  const columns = React.useMemo(() => {
    const base = [
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
    ];

    if (!isAdmin) return base;

    base.push({
      id: "actions",
      header: "Actions",
      sortValue: () => 0,
      cell: (p: PrincipalRow) => {
        const key = rowKey(p);
        const error = actionErrors[key];
        const busy = actionBusy[key];
        const canRevoke = p.directPermissionIds.length > 0;
        return (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRevoke || busy}
              onClick={async () => {
                if (!canRevoke || busy) return;
                const confirmed = window.confirm("Revoke explicit access for this principal?");
                if (!confirmed) return;
                setActionBusy((prev) => ({ ...prev, [key]: true }));
                setActionErrors((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                });

                const results = await Promise.all(
                  p.directPermissionIds.map((permissionId) => deletePermission(driveId, itemId, permissionId))
                );
                const failures = results.filter((r) => !r.ok);
                if (failures.length) {
                  const firstError = failures[0].error || "Permission revoke failed";
                  setActionErrors((prev) => ({
                    ...prev,
                    [key]: `${failures.length} permissions failed to revoke: ${firstError}`,
                  }));
                } else {
                  setActionErrors((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                  });
                  router.refresh();
                }
                setActionBusy((prev) => ({ ...prev, [key]: false }));
              }}
            >
              {busy ? "Revoking..." : "Revoke"}
            </Button>
            {error ? <div className="text-xs text-red-600">{error}</div> : null}
          </div>
        );
      },
    });

    return base;
  }, [actionBusy, actionErrors, driveId, itemId, isAdmin, rowKey, router]);

  return <SortableTable items={principals} columns={columns} getRowKey={rowKey} emptyMessage="No principals found." />;
}

export function ItemPermissionsTable({
  permissions,
  isAdmin,
  driveId,
  itemId,
}: {
  permissions: PermissionRow[];
  isAdmin: boolean;
  driveId: string;
  itemId: string;
}) {
  const router = useRouter();
  const [actionErrors, setActionErrors] = React.useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = React.useState<Record<string, boolean>>({});

  const columns = React.useMemo(() => {
    const base = [
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
    ];

    if (!isAdmin) return base;

    base.push({
      id: "actions",
      header: "Actions",
      sortValue: () => 0,
      cell: (p: PermissionRow) => {
        const error = actionErrors[p.permissionId];
        const busy = actionBusy[p.permissionId];
        const canRevoke = !p.isOwnerRole;
        return (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!canRevoke || busy}
              onClick={async () => {
                if (!canRevoke || busy) return;
                const confirmed = window.confirm("Revoke this permission?");
                if (!confirmed) return;
                setActionBusy((prev) => ({ ...prev, [p.permissionId]: true }));
                setActionErrors((prev) => {
                  const next = { ...prev };
                  delete next[p.permissionId];
                  return next;
                });

                const result = await deletePermission(driveId, itemId, p.permissionId);
                if (!result.ok) {
                  setActionErrors((prev) => ({
                    ...prev,
                    [p.permissionId]: result.error || "Permission revoke failed",
                  }));
                } else {
                  setActionErrors((prev) => {
                    const next = { ...prev };
                    delete next[p.permissionId];
                    return next;
                  });
                  router.refresh();
                }
                setActionBusy((prev) => ({ ...prev, [p.permissionId]: false }));
              }}
            >
              {busy ? "Revoking..." : "Revoke"}
            </Button>
            {error ? <div className="text-xs text-red-600">{error}</div> : null}
          </div>
        );
      },
    });

    return base;
  }, [actionBusy, actionErrors, driveId, itemId, isAdmin, router]);

  return <SortableTable items={permissions} columns={columns} getRowKey={(p) => p.permissionId} emptyMessage="No permissions found." />;
}
