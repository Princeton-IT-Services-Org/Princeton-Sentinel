"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatIsoDateTime } from "@/app/lib/format";

type UserRow = {
  user_id: string;
  display_name: string | null;
  mail: string | null;
  user_principal_name: string | null;
  modified_items: number;
  sites_touched: number;
  last_modified_dt: string | null;
  last_sign_in_dt: string | null;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function windowLabel(windowDays: number | null): string {
  return windowDays == null ? "All-time" : `${windowDays}d`;
}

export function UsersTable({ items, windowDays }: { items: UserRow[]; windowDays: number | null }) {
  const daysParam = windowDays == null ? "all" : String(windowDays);
  const columns = React.useMemo(
    () => [
      {
        id: "user",
        header: "User",
        sortValue: (u: UserRow) => u.display_name ?? u.mail ?? u.user_principal_name ?? u.user_id,
        cell: (u: UserRow) => (
          <div className="flex flex-col">
            <Link
              className="font-medium hover:underline"
              href={`/dashboard/users/${encodeURIComponent(u.user_id)}?days=${daysParam}`}
            >
              {u.display_name ?? u.mail ?? u.user_principal_name ?? u.user_id}
            </Link>
            <span className="truncate text-xs text-muted-foreground">{u.mail ?? u.user_principal_name ?? u.user_id}</span>
          </div>
        ),
        cellClassName: "max-w-[520px]",
      },
      {
        id: "modified",
        header: `Items last modified (${windowLabel(windowDays)})`,
        sortValue: (u: UserRow) => u.modified_items,
        cell: (u: UserRow) => <span className="text-muted-foreground">{u.modified_items.toLocaleString()}</span>,
      },
      {
        id: "sites",
        header: `Sites (${windowLabel(windowDays)})`,
        sortValue: (u: UserRow) => u.sites_touched,
        cell: (u: UserRow) => <span className="text-muted-foreground">{u.sites_touched.toLocaleString()}</span>,
      },
      {
        id: "lastModified",
        header: "Last modified",
        sortValue: (u: UserRow) => parseIsoToTs(u.last_modified_dt),
        cell: (u: UserRow) => <span className="text-muted-foreground">{formatIsoDateTime(u.last_modified_dt)}</span>,
      },
      {
        id: "lastSignIn",
        header: "Last successful sign-in",
        sortValue: (u: UserRow) => parseIsoToTs(u.last_sign_in_dt),
        cell: (u: UserRow) => <span className="text-muted-foreground">{formatIsoDateTime(u.last_sign_in_dt)}</span>,
      },
    ],
    [daysParam, windowDays]
  );

  return (
    <SortableTable
      mode="server"
      items={items}
      columns={columns}
      getRowKey={(u) => u.user_id}
      emptyMessage="No users matched your search."
    />
  );
}
