import Link from "next/link";

import { Button } from "@/components/ui/button";

function buildHref(pathname: string, params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    const str = String(v);
    if (!str) continue;
    sp.set(k, str);
  }
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function Pagination({
  pathname,
  page,
  pageSize,
  totalItems,
  extraParams,
  pageParam = "page",
  pageSizeParam = "pageSize",
}: {
  pathname: string;
  page: number;
  pageSize: number;
  totalItems: number;
  extraParams: Record<string, string | number | undefined | null>;
  pageParam?: string;
  pageSizeParam?: string;
}) {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const hasPrev = clampedPage > 1;
  const hasNext = clampedPage < totalPages;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="text-sm text-muted-foreground">
        Page {clampedPage.toLocaleString()} of {totalPages.toLocaleString()} • {totalItems.toLocaleString()} items
      </div>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Button asChild variant="outline">
            <Link href={buildHref(pathname, { ...extraParams, [pageParam]: clampedPage - 1, [pageSizeParam]: pageSize })}>
              Previous
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            Previous
          </Button>
        )}

        <div className="flex max-w-full items-center gap-1 overflow-x-auto py-1">
          {pages.map((p) =>
            p === clampedPage ? (
              <Button key={p} asChild variant="default" size="sm" className="min-w-9 px-2">
                <span aria-current="page">{p.toLocaleString()}</span>
              </Button>
            ) : (
              <Button key={p} asChild variant="outline" size="sm" className="min-w-9 px-2">
                <Link
                  href={buildHref(pathname, { ...extraParams, [pageParam]: p, [pageSizeParam]: pageSize })}
                  aria-label={`Go to page ${p.toLocaleString()}`}
                >
                  {p.toLocaleString()}
                </Link>
              </Button>
            )
          )}
        </div>

        {hasNext ? (
          <Button asChild variant="outline">
            <Link href={buildHref(pathname, { ...extraParams, [pageParam]: clampedPage + 1, [pageSizeParam]: pageSize })}>
              Next
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
