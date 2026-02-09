"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatBytes, formatIsoDateTime } from "@/app/lib/format";

type RecentItemRow = {
  itemId: string;
  name: string;
  webUrl: string | null;
  normalizedPath: string | null;
  lastModifiedDateTime: string | null;
};

type LargestFileRow = {
  itemId: string;
  name: string;
  webUrl: string | null;
  normalizedPath: string | null;
  size: number | null;
};

type MostPermissionedItemRow = {
  itemId: string;
  name: string;
  webUrl: string | null;
  sharingLinks: number;
  permissions: number;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function SiteRecentlyModifiedTable({ items }: { items: RecentItemRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (it: RecentItemRow) => it.name,
        cell: (it: RecentItemRow) => (
          <div className="max-w-[520px]">
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
            <div className="truncate text-xs text-muted-foreground">{it.normalizedPath ?? it.itemId}</div>
          </div>
        ),
      },
      {
        id: "modified",
        header: "Modified",
        sortValue: (it: RecentItemRow) => parseIsoToTs(it.lastModifiedDateTime),
        cell: (it: RecentItemRow) => <span className="text-muted-foreground">{formatIsoDateTime(it.lastModifiedDateTime)}</span>,
      },
    ],
    []
  );

  return <SortableTable items={items} columns={columns} getRowKey={(it) => it.itemId} emptyMessage="No recent modifications found." />;
}

export function SiteLargestFilesTable({ items }: { items: LargestFileRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "file",
        header: "File",
        sortValue: (it: LargestFileRow) => it.name,
        cell: (it: LargestFileRow) => (
          <div className="max-w-[520px]">
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
            <div className="truncate text-xs text-muted-foreground">{it.normalizedPath ?? it.itemId}</div>
          </div>
        ),
      },
      {
        id: "size",
        header: "Size",
        sortValue: (it: LargestFileRow) => it.size,
        cell: (it: LargestFileRow) => <span className="text-muted-foreground">{formatBytes(it.size)}</span>,
      },
    ],
    []
  );

  return <SortableTable items={items} columns={columns} getRowKey={(it) => it.itemId} emptyMessage="No file size data found." />;
}

export function SiteMostPermissionedItemsTable({ items }: { items: MostPermissionedItemRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (it: MostPermissionedItemRow) => it.name,
        cell: (it: MostPermissionedItemRow) => (
          <div className="max-w-[620px]">
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
        sortValue: (it: MostPermissionedItemRow) => it.sharingLinks,
        cell: (it: MostPermissionedItemRow) => <span className="text-muted-foreground">{it.sharingLinks.toLocaleString()}</span>,
      },
      {
        id: "permissions",
        header: "Permissions",
        sortValue: (it: MostPermissionedItemRow) => it.permissions,
        cell: (it: MostPermissionedItemRow) => <span className="text-muted-foreground">{it.permissions.toLocaleString()}</span>,
      },
    ],
    []
  );

  return <SortableTable items={items} columns={columns} getRowKey={(it) => it.itemId} emptyMessage="No permissions found for this site." />;
}
