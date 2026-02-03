import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, getWindowDays, SearchParams } from "@/app/lib/params";
import { UsersTable } from "./users-table";
import { UsersSummaryBarChartClient } from "@/components/users-summary-graphs-wrapper";

function buildSearchClause(search: string | null, startIndex: number) {
  if (!search) return { clause: "", params: [] as any[] };
  const pattern = `%${search.toLowerCase()}%`;
  const clause = `AND (LOWER(u.display_name) LIKE $${startIndex} OR LOWER(u.mail) LIKE $${startIndex} OR LOWER(u.user_principal_name) LIKE $${startIndex} OR LOWER(a.user_id) LIKE $${startIndex})`;
  return { clause, params: [pattern] };
}

export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const windowDays = getWindowDays(searchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "modified";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    user: "u.display_name",
    modified: "a.modified_items",
    sites: "a.sites_touched",
    lastModified: "a.last_modified_dt",
  };
  const sortColumn = sortMap[sort] || "a.modified_items";

  const searchClause = buildSearchClause(search, windowStart ? 2 : 1);

  const rows = await query<any>(
    `
    WITH activity AS (
      SELECT
        i.last_modified_by_user_id AS user_id,
        COUNT(*)::int AS modified_items,
        COUNT(DISTINCT COALESCE(d.site_id, d.id))::int AS sites_touched,
        MAX(i.modified_dt) AS last_modified_dt
      FROM msgraph_drive_items i
      JOIN msgraph_drives d ON d.id = i.drive_id
      WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
        AND i.last_modified_by_user_id IS NOT NULL
        ${windowStart ? "AND i.modified_dt >= $1" : ""}
      GROUP BY i.last_modified_by_user_id
    )
    SELECT
      a.user_id,
      u.display_name,
      u.mail,
      u.user_principal_name,
      a.modified_items,
      a.sites_touched,
      a.last_modified_dt,
      NULL::timestamptz AS last_sign_in_dt
    FROM activity a
    LEFT JOIN msgraph_users u ON u.id = a.user_id AND u.deleted_at IS NULL
    WHERE 1=1
      ${searchClause.clause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${windowStart ? 2 + searchClause.params.length : 1 + searchClause.params.length}
    OFFSET $${windowStart ? 3 + searchClause.params.length : 2 + searchClause.params.length}
    `,
    windowStart ? [windowStart, ...searchClause.params, pageSize, offset] : [...searchClause.params, pageSize, offset]
  );

  const totalRows = await query<any>(
    `
    WITH activity AS (
      SELECT
        i.last_modified_by_user_id AS user_id
      FROM msgraph_drive_items i
      JOIN msgraph_drives d ON d.id = i.drive_id
      WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
        AND i.last_modified_by_user_id IS NOT NULL
        ${windowStart ? "AND i.modified_dt >= $1" : ""}
      GROUP BY i.last_modified_by_user_id
    )
    SELECT COUNT(*)::int AS total
    FROM activity a
    LEFT JOIN msgraph_users u ON u.id = a.user_id AND u.deleted_at IS NULL
    WHERE 1=1
      ${searchClause.clause}
    `,
    windowStart ? [windowStart, ...searchClause.params] : [...searchClause.params]
  );

  const total = totalRows[0]?.total || 0;

  const topByModified = [...rows]
    .sort((a, b) => b.modified_items - a.modified_items)
    .slice(0, 10)
    .map((u) => ({ label: u.display_name ?? u.user_id, value: u.modified_items ?? 0 }));

  const topBySites = [...rows]
    .sort((a, b) => b.sites_touched - a.sites_touched)
    .slice(0, 10)
    .map((u) => ({ label: u.display_name ?? u.user_id, value: u.sites_touched ?? 0 }));

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Based on which items each user is currently the last modifier for. Window: {windowDays ?? "all"}d.
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/dashboard/users" method="get">
          <Input name="q" placeholder="Search users…" defaultValue={search || ""} className="w-64" />
          <select
            name="days"
            defaultValue={windowDays == null ? "all" : String(windowDays)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            title="Window"
          >
            <option value="all">All-time</option>
            <option value="7">7d</option>
            <option value="30">30d</option>
            <option value="90">90d</option>
            <option value="365">365d</option>
          </select>
          <Input
            name="pageSize"
            type="number"
            min={10}
            max={200}
            defaultValue={String(pageSize)}
            className="w-24"
            title="Page size"
          />
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      </div>

      <div className="flex flex-row gap-4 items-center justify-center">
        <Card className="w-full max-w-xs text-center shadow-lg border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(total)}</CardTitle>
            <CardDescription>Total Users</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="w-full flex flex-col md:flex-row gap-6 items-center justify-center my-2">
        <Card className="w-full md:w-1/2 max-w-xl flex flex-col items-center justify-center shadow-lg border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle>Top 10 Users by Items Last Modified</CardTitle>
          </CardHeader>
          <CardContent className="w-full flex items-center justify-center">
            <div className="w-full h-72 flex items-center justify-center">
              <UsersSummaryBarChartClient data={topByModified} label="Items last modified" xTitle="Count" />
            </div>
          </CardContent>
        </Card>
        <Card className="w-full md:w-1/2 max-w-xl flex flex-col items-center justify-center shadow-lg border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle>Top 10 Users by Sites</CardTitle>
          </CardHeader>
          <CardContent className="w-full flex items-center justify-center">
            <div className="w-full h-72 flex items-center justify-center">
              <UsersSummaryBarChartClient data={topBySites} label="Sites" xTitle="Count" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active users</CardTitle>
          <CardDescription>
            {formatNumber(total)} users • showing {formatNumber(rows.length)} • click a user for details
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <UsersTable items={rows} windowDays={windowDays} />
        </CardContent>
      </Card>

      <Pagination
        pathname="/dashboard/users"
        page={page}
        pageSize={pageSize}
        totalItems={total}
        extraParams={{ q: search || undefined, pageSize, sort, dir, days: windowDays == null ? "all" : windowDays }}
      />
    </main>
  );
}
