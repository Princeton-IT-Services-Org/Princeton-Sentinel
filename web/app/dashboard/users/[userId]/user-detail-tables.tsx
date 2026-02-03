"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatIsoDateTime } from "@/app/lib/format";

type TopSiteRow = {
  siteId: string;
  title: string | null;
  webUrl: string | null;
  modifiedItems: number;
  lastModifiedDateTime: string | null;
};

type RecentItemRow = {
  itemId: string;
  name: string;
  webUrl: string | null;
  normalizedPath: string | null;
  lastModifiedDateTime: string | null;
  siteId: string | null;
  siteTitle: string | null;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function UserTopSitesTable({ sites }: { sites: TopSiteRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "site",
        header: "Site",
        sortValue: (s: TopSiteRow) => s.title ?? s.siteId,
        cell: (s: TopSiteRow) => (
          <div className="flex flex-col gap-1 max-w-[520px]">
            <Link className="font-medium hover:underline" href={`/dashboard/sites/${encodeURIComponent(s.siteId)}`}>
              {s.title ?? s.siteId}
            </Link>
            {s.webUrl ? (
              <a className="truncate text-xs text-muted-foreground hover:underline" href={s.webUrl} target="_blank" rel="noreferrer">
                {s.webUrl}
              </a>
            ) : (
              <span className="truncate text-xs text-muted-foreground">{s.siteId}</span>
            )}
          </div>
        ),
      },
      {
        id: "modified",
        header: "Items last modified",
        sortValue: (s: TopSiteRow) => s.modifiedItems,
        cell: (s: TopSiteRow) => <span className="text-muted-foreground">{s.modifiedItems.toLocaleString()}</span>,
      },
      {
        id: "lastModified",
        header: "Last modified",
        sortValue: (s: TopSiteRow) => parseIsoToTs(s.lastModifiedDateTime),
        cell: (s: TopSiteRow) => <span className="text-muted-foreground">{formatIsoDateTime(s.lastModifiedDateTime)}</span>,
      },
    ],
    []
  );

  return <SortableTable items={sites} columns={columns} getRowKey={(s) => s.siteId} emptyMessage="No site activity found for this user." />;
}

export function UserRecentItemsTable({ items }: { items: RecentItemRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (it: RecentItemRow) => it.name,
        cell: (it: RecentItemRow) => (
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
            <div className="truncate text-xs text-muted-foreground">{it.normalizedPath ?? it.itemId}</div>
          </div>
        ),
      },
      {
        id: "site",
        header: "Site",
        sortValue: (it: RecentItemRow) => it.siteTitle ?? it.siteId ?? "",
        cell: (it: RecentItemRow) =>
          it.siteId ? (
            <Link className="text-muted-foreground hover:underline" href={`/dashboard/sites/${encodeURIComponent(it.siteId)}`}>
              {it.siteTitle ?? it.siteId}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        cellClassName: "max-w-[360px]",
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

  return <SortableTable items={items} columns={columns} getRowKey={(it) => it.itemId} emptyMessage="No recent modifications found for this user." />;
}
