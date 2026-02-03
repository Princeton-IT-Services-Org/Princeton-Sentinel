"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";
import { formatIsoDateTime } from "@/app/lib/format";

type GroupRow = {
  group_id: string;
  display_name: string | null;
  mail: string | null;
  visibility: string | null;
  member_count: number;
  created_dt: string | null;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function GroupsTable({ items }: { items: GroupRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "group",
        header: "Group",
        sortValue: (g: GroupRow) => g.display_name ?? g.mail ?? g.group_id,
        cell: (g: GroupRow) => (
          <div className="flex flex-col">
            <Link className="font-medium hover:underline" href={`/dashboard/groups/${encodeURIComponent(g.group_id)}`}>
              {g.display_name ?? g.mail ?? g.group_id}
            </Link>
            <span className="truncate text-xs text-muted-foreground">{g.mail ?? g.group_id}</span>
          </div>
        ),
        cellClassName: "max-w-[520px]",
      },
      {
        id: "visibility",
        header: "Visibility",
        sortValue: (g: GroupRow) => g.visibility ?? "",
        cell: (g: GroupRow) => <span className="text-muted-foreground">{g.visibility ?? "—"}</span>,
      },
      {
        id: "members",
        header: "Members",
        sortValue: (g: GroupRow) => g.member_count,
        cell: (g: GroupRow) => <span className="text-muted-foreground">{g.member_count.toLocaleString()}</span>,
      },
      {
        id: "created",
        header: "Created",
        sortValue: (g: GroupRow) => parseIsoToTs(g.created_dt),
        cell: (g: GroupRow) => <span className="text-muted-foreground">{formatIsoDateTime(g.created_dt)}</span>,
      },
    ],
    []
  );

  return (
    <SortableTable
      mode="server"
      items={items}
      columns={columns}
      getRowKey={(g) => g.group_id}
      emptyMessage="No groups matched your search."
    />
  );
}
