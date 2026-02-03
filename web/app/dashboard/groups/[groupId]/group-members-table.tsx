"use client";

import Link from "next/link";
import * as React from "react";

import { SortableTable } from "@/components/sortable-table";

type GroupMemberRow = {
  userId: string;
  displayName: string | null;
  email: string | null;
  userPrincipalName: string | null;
};

export function GroupMembersTable({ items }: { items: GroupMemberRow[] }) {
  const columns = React.useMemo(
    () => [
      {
        id: "user",
        header: "User",
        sortValue: (u: GroupMemberRow) => u.displayName ?? u.email ?? u.userPrincipalName ?? u.userId,
        cell: (u: GroupMemberRow) => (
          <div className="max-w-[620px]">
            <div className="font-medium">{u.displayName ?? u.email ?? u.userPrincipalName ?? u.userId}</div>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <Link className="hover:underline" href={`/dashboard/users?q=${encodeURIComponent(u.email ?? u.userPrincipalName ?? u.userId)}`}>
                Search user
              </Link>
            </div>
            <div className="truncate text-xs text-muted-foreground">{u.email ?? u.userPrincipalName ?? u.userId}</div>
          </div>
        ),
      },
      {
        id: "email",
        header: "Email/UPN",
        sortValue: (u: GroupMemberRow) => u.email ?? u.userPrincipalName ?? "",
        cell: (u: GroupMemberRow) => <span className="text-muted-foreground">{u.email ?? u.userPrincipalName ?? "—"}</span>,
      },
    ],
    []
  );

  return <SortableTable mode="client" items={items} columns={columns} getRowKey={(u) => u.userId} emptyMessage="No members found." />;
}
