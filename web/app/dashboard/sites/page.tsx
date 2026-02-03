import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, SearchParams } from "@/app/lib/params";
import { SitesTable } from "./sites-table";
import { SitesSummaryGraph } from "@/components/sites-summary-graph";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE (LOWER(title) LIKE $1 OR LOWER(web_url) LIKE $1 OR LOWER(site_id) LIKE $1 OR LOWER(site_key) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export const dynamic = "force-dynamic";

export default async function SitesPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const sort = getParam(searchParams, "sort") || "lastActivity";
  const dir = getSortDirection(searchParams, "desc");

  const sortMap: Record<string, string> = {
    title: "title",
    type: "is_personal",
    template: "template",
    created: "created_dt",
    storage: "storage_used_bytes",
    lastActivity: "last_activity_dt",
  };
  const sortColumn = sortMap[sort] || "last_activity_dt";
  const { clause, params } = buildSearchFilter(search);

  const countRows = await query<any>(`SELECT COUNT(*)::int AS total FROM mv_msgraph_site_inventory ${clause}`, params);
  const total = countRows[0]?.total || 0;

  const summaryRows = await query<any>(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_dt >= now() - interval '30 days')::int AS new_30,
      COUNT(*) FILTER (WHERE created_dt >= now() - interval '90 days')::int AS new_90,
      COUNT(*) FILTER (WHERE is_personal = true)::int AS personal_count,
      COUNT(*) FILTER (WHERE is_personal = false)::int AS sharepoint_count
    FROM mv_msgraph_site_inventory
    ${clause}
    `,
    params
  );

  const createdSeries = search
    ? await query<any>(
        `
        SELECT date_trunc('month', created_dt) AS month, COUNT(*)::int AS count
        FROM mv_msgraph_site_inventory
        ${clause}
        GROUP BY date_trunc('month', created_dt)
        ORDER BY month DESC
        LIMIT 12
        `,
        params
      )
    : await query<any>(
        `
        SELECT month, total_count AS count
        FROM mv_msgraph_sites_created_month
        ORDER BY month DESC
        LIMIT 12
        `
      );

  const rows = await query<any>(
    `
    SELECT site_key, site_id, title, web_url, created_dt, is_personal, template,
           storage_used_bytes, storage_total_bytes, last_activity_dt
    FROM mv_msgraph_site_inventory
    ${clause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );

  const summary = summaryRows[0] || {};
  const typeBreakdown = [
    { label: "SharePoint", value: Number(summary.sharepoint_count || 0) },
    { label: "Personal", value: Number(summary.personal_count || 0) },
    { label: "Unknown", value: Math.max(0, Number(summary.total || total) - Number(summary.sharepoint_count || 0) - Number(summary.personal_count || 0)) },
  ].filter((p) => p.value > 0);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sites</h1>
          <p className="text-sm text-muted-foreground">Discovery & inventory across SharePoint sites.</p>
        </div>
        <form className="flex items-center gap-2" action="/dashboard/sites" method="get">
          <Input name="q" placeholder="Search title, URL, id…" defaultValue={search || ""} className="w-72" />
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="text-center shadow-lg border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(total)}</CardTitle>
            <CardDescription>Total Sites</CardDescription>
          </CardHeader>
        </Card>
        <Card className="text-center shadow-lg border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(summary.new_30 || 0)}</CardTitle>
            <CardDescription>New (30 days)</CardDescription>
          </CardHeader>
        </Card>
        <Card className="text-center shadow-lg border border-gray-200 bg-white">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(summary.new_90 || 0)}</CardTitle>
            <CardDescription>New (90 days)</CardDescription>
          </CardHeader>
        </Card>
      </div>

  <SitesSummaryGraph
    typeBreakdown={typeBreakdown}
    createdByMonth={createdSeries.map((p: any) => ({
      label: p.month ? new Date(p.month).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) : "--",
      value: p.count,
    }))}
  />

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
            {formatNumber(total)} sites • showing {formatNumber(rows.length)}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SitesTable items={rows} />
        </CardContent>
      </Card>

      <Pagination
        pathname="/dashboard/sites"
        page={page}
        pageSize={pageSize}
        totalItems={total}
        extraParams={{ q: search || undefined, sort, dir }}
      />
    </main>
  );
}
