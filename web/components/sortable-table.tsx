"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export type SortState = {
  columnId: string;
  direction: SortDirection;
};

export type SortValue = string | number | boolean | Date | null | undefined;

export type SortableTableColumn<T> = {
  id: string;
  header: React.ReactNode;
  sortValue: (row: T) => SortValue;
  cell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
};

type Props<T> = {
  items: T[];
  columns: Array<SortableTableColumn<T>>;
  getRowKey?: (row: T, index: number) => React.Key;
  emptyMessage?: React.ReactNode;
  mode?: "client" | "server";
  sortParam?: string;
  dirParam?: string;
  pageParam?: string;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function toSortablePrimitive(value: SortValue): string | number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  return String(value);
}

function compareValues(a: SortValue, b: SortValue): number {
  const ap = toSortablePrimitive(a);
  const bp = toSortablePrimitive(b);

  const aNull = ap == null || ap === "";
  const bNull = bp == null || bp === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;

  if (typeof ap === "number" && typeof bp === "number") return ap - bp;
  return collator.compare(String(ap), String(bp));
}

function arrowForDirection(direction: SortDirection): string {
  return direction === "asc" ? "▲" : "▼";
}

export function SortableTable<T>({
  items,
  columns,
  getRowKey,
  emptyMessage,
  mode = "client",
  sortParam = "sort",
  dirParam = "dir",
  pageParam = "page",
}: Props<T>) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const serverSort = React.useMemo<SortState | null>(() => {
    if (!searchParams) return null;
    const col = searchParams.get(sortParam);
    const dir = searchParams.get(dirParam);
    if (!col) return null;
    if (!columns.some((c) => c.id === col)) return null;
    const direction: SortDirection = dir === "desc" ? "desc" : "asc";
    return { columnId: col, direction };
  }, [columns, dirParam, searchParams, sortParam]);

  const [clientSort, setClientSort] = React.useState<SortState | null>(null);
  const activeSort = mode === "server" ? serverSort : clientSort;

  const sortedItems = React.useMemo(() => {
    if (mode === "server") return items;
    if (!clientSort) return items;
    const column = columns.find((c) => c.id === clientSort.columnId);
    if (!column) return items;

    const sign = clientSort.direction === "asc" ? 1 : -1;
    const indexed = items.map((row, index) => ({ row, index }));
    indexed.sort((a, b) => {
      const cmp = compareValues(column.sortValue(a.row), column.sortValue(b.row));
      if (cmp !== 0) return cmp * sign;
      return a.index - b.index;
    });
    return indexed.map((i) => i.row);
  }, [items, columns, clientSort, mode]);

  const setServerSort = React.useCallback(
    (next: SortState) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set(sortParam, next.columnId);
      sp.set(dirParam, next.direction);
      sp.set(pageParam, "1");
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [dirParam, pageParam, pathname, router, searchParams, sortParam]
  );

  return (
    <Table suppressHydrationWarning>
      <TableHeader>
        <TableRow>
          {columns.map((col) => {
            const active = activeSort?.columnId === col.id;
            const ariaSort = active ? (activeSort!.direction === "asc" ? "ascending" : "descending") : "none";
            return (
              <TableHead key={col.id} className={col.headerClassName} aria-sort={ariaSort}>
                <button
                  type="button"
                  onClick={() => {
                    const next: SortState = active
                      ? { columnId: col.id, direction: activeSort!.direction === "asc" ? "desc" : "asc" }
                      : { columnId: col.id, direction: "asc" };

                    if (mode === "server") {
                      setServerSort(next);
                      return;
                    }

                    setClientSort(next);
                  }}
                  className={cn(
                    "group inline-flex w-full items-center gap-1 text-left",
                    "select-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  )}
                >
                  <span>{col.header}</span>
                  <span
                    className={cn(
                      "text-[10px] leading-none text-muted-foreground transition-opacity",
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                    )}
                    aria-hidden="true"
                  >
                    {active ? arrowForDirection(activeSort!.direction) : "↕"}
                  </span>
                </button>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedItems.map((row, idx) => (
          <TableRow key={getRowKey ? getRowKey(row, idx) : idx}>
            {columns.map((col) => (
              <TableCell key={col.id} className={col.cellClassName}>
                {col.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {!sortedItems.length && emptyMessage != null ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="py-8 text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
