"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatBytes, formatIsoDateTime } from "@/app/lib/format";

type RiskItemRow = {
  item_id: string;
  name: string;
  web_url: string | null;
  normalized_path: string | null;
  size: number | null;
  modified_dt: string | null;
  link_scope: "anonymous" | "organization" | "users";
  link_shares: number;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function RiskItemsTable({ items }: { items: RiskItemRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (it: RiskItemRow) => it.name,
        cell: (it: RiskItemRow) => (
          <div className="max-w-[520px]">
            <div className="font-medium">
              <Link className="hover:underline" href={`/dashboard/items/${encodeURIComponent(it.item_id)}`}>
                {it.name}
              </Link>
            </div>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              {it.web_url ? (
                <a className="hover:underline" href={it.web_url} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : null}
              <span className="truncate font-mono">{it.item_id}</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">{it.normalized_path ?? "—"}</div>
          </div>
        ),
      },
      {
        id: "links",
        header: "Links",
        sortValue: (it: RiskItemRow) => it.link_shares,
        cell: (it: RiskItemRow) => <span className="text-muted-foreground">{it.link_shares.toLocaleString()}</span>,
      },
      {
        id: "size",
        header: "Size",
        sortValue: (it: RiskItemRow) => it.size,
        cell: (it: RiskItemRow) => <span className="text-muted-foreground">{formatBytes(it.size)}</span>,
      },
      {
        id: "modified",
        header: "Last modified",
        sortValue: (it: RiskItemRow) => parseIsoToTs(it.modified_dt),
        cell: (it: RiskItemRow) => <span className="text-muted-foreground">{formatIsoDateTime(it.modified_dt)}</span>,
      },
    ],
    []
  );

  return <SortableTable items={items} columns={columns} getRowKey={(it) => it.item_id} emptyMessage="No items found." />;
}
