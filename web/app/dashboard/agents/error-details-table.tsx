"use client";

import * as React from "react";

import LocalDateTime from "@/components/local-date-time";
import { SortableTable } from "@/components/sortable-table";

export type ErrorDetailRow = {
  timestamp: string | null;
  agent: string;
  channel: string;
  sessionId: string;
  errorCode: string;
  errorMessage: string;
  userName: string;
};

function parseIsoToTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

export function ErrorDetailsTable({ items }: { items: ErrorDetailRow[] }) {
  const stickyHeaderClassName = "sticky top-0 z-10 bg-background";

  const columns = React.useMemo(
    () => [
      {
        id: "timestamp",
        header: "Timestamp",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => parseIsoToTs(row.timestamp),
        cell: (row: ErrorDetailRow) => (
          <span className="whitespace-nowrap text-muted-foreground">
            <LocalDateTime value={row.timestamp} fallback="—" />
          </span>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => row.agent,
        cell: (row: ErrorDetailRow) => <span className="whitespace-nowrap">{row.agent || "—"}</span>,
      },
      {
        id: "channel",
        header: "Channel",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => row.channel,
        cell: (row: ErrorDetailRow) => <span className="whitespace-nowrap">{row.channel || "—"}</span>,
      },
      {
        id: "user",
        header: "User",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => row.userName,
        cell: (row: ErrorDetailRow) => <span className="whitespace-nowrap">{row.userName || "—"}</span>,
      },
      {
        id: "errorCode",
        header: "Error Code",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => row.errorCode,
        cell: (row: ErrorDetailRow) => <span className="whitespace-nowrap">{row.errorCode || "—"}</span>,
      },
      {
        id: "errorMessage",
        header: "Error Message",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => row.errorMessage,
        cell: (row: ErrorDetailRow) => (
          <span className="block max-w-md truncate text-red-500" title={row.errorMessage || "—"}>
            {row.errorMessage || "—"}
          </span>
        ),
        cellClassName: "max-w-md",
      },
      {
        id: "conversationId",
        header: "Conversation ID",
        headerClassName: stickyHeaderClassName,
        sortValue: (row: ErrorDetailRow) => row.sessionId,
        cell: (row: ErrorDetailRow) => <span className="font-mono text-xs">{row.sessionId || "—"}</span>,
      },
    ],
    [stickyHeaderClassName]
  );

  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <SortableTable
        mode="client"
        items={items}
        columns={columns}
        getRowKey={(row, index) => `${row.timestamp ?? "missing"}:${row.sessionId ?? "missing"}:${index}`}
        emptyMessage="No errors in this time range."
      />
    </div>
  );
}
