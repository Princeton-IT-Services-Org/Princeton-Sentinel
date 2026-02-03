"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatBytes, formatIsoDateTime } from "@/app/lib/format";

type SharingLinkItemRow = {
  itemId: string;
  name: string;
  webUrl: string | null;
  normalizedPath: string | null;
  isFolder: boolean;
  size: number | null;
  lastModifiedDateTime: string | null;
  matchingPermissions: number;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function SharingLinkItemsTable({ items }: { items: SharingLinkItemRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (it: SharingLinkItemRow) => it.name,
        cell: (it: SharingLinkItemRow) => (
          <div className="max-w-[680px]">
            <div className="font-medium">
              <Link className="hover:underline" href={`/dashboard/items/${encodeURIComponent(it.itemId)}`}>
                {it.name}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">{it.isFolder ? "(folder)" : ""}</span>
            </div>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              {it.webUrl ? (
                <a className="hover:underline" href={it.webUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
              <Link className="hover:underline" href={`/dashboard/items/${encodeURIComponent(it.itemId)}`}>
                Details
              </Link>
            </div>
            <div className="truncate text-xs text-muted-foreground">{it.normalizedPath ?? it.itemId}</div>
          </div>
        ),
      },
      {
        id: "matches",
        header: "Matching permissions",
        sortValue: (it: SharingLinkItemRow) => it.matchingPermissions,
        cell: (it: SharingLinkItemRow) => <span className="text-muted-foreground">{it.matchingPermissions.toLocaleString()}</span>,
      },
      {
        id: "size",
        header: "Size",
        sortValue: (it: SharingLinkItemRow) => it.size,
        cell: (it: SharingLinkItemRow) => <span className="text-muted-foreground">{it.isFolder ? "—" : formatBytes(it.size)}</span>,
      },
      {
        id: "lastModified",
        header: "Last modified",
        sortValue: (it: SharingLinkItemRow) => parseIsoToTs(it.lastModifiedDateTime),
        cell: (it: SharingLinkItemRow) => <span className="text-muted-foreground">{formatIsoDateTime(it.lastModifiedDateTime)}</span>,
      },
    ],
    []
  );

  return <SortableTable mode="client" items={items} columns={columns} getRowKey={(it) => it.itemId} emptyMessage="No items found." />;
}
