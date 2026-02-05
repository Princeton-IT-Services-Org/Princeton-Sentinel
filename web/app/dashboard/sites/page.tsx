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

  const baseCte = `
    WITH sharepoint_group_names AS (
      SELECT d.site_id, MAX(g.display_name) AS group_name
      FROM msgraph_drives d
      JOIN msgraph_groups g ON g.id = d.owner_graph_id
      WHERE d.deleted_at IS NULL AND d.site_id IS NOT NULL AND d.owner_type = 'group' AND g.deleted_at IS NULL
      GROUP BY d.site_id
    ),
    personal_drives AS (
      SELECT
        d.id,
        d.owner_id,
        d.owner_display_name,
        d.owner_email,
        d.web_url,
        d.quota_used,
        d.quota_total,
        d.created_dt,
        regexp_replace(lower(trim(trailing '/' from d.web_url)), '(.*/personal/[^/]+).*', '\\1') AS base_url_norm,
        regexp_replace(trim(trailing '/' from d.web_url), '(.*/personal/[^/]+).*', '\\1') AS base_url
      FROM msgraph_drives d
      WHERE d.deleted_at IS NULL AND d.site_id IS NULL AND d.web_url IS NOT NULL AND d.web_url ILIKE '%/personal/%'
    ),
    personal_groups AS (
      SELECT
        base_url_norm AS site_key,
        base_url AS web_url,
        COALESCE(MAX(u.display_name), MAX(pd.owner_display_name), MAX(pd.owner_email), MAX(base_url)) AS title,
        MIN(pd.created_dt) AS created_dt,
        COUNT(*)::int AS drive_count,
        SUM(pd.quota_used) AS storage_used_bytes,
        SUM(pd.quota_total) AS storage_total_bytes
      FROM personal_drives pd
      LEFT JOIN msgraph_users u ON u.id = pd.owner_id AND u.deleted_at IS NULL
      GROUP BY base_url_norm, base_url
    ),
    personal_last_write AS (
      SELECT pd.base_url_norm AS site_key, MAX(i.modified_dt) AS last_write_dt
      FROM personal_drives pd
      JOIN msgraph_drive_items i ON i.drive_id = pd.id
      WHERE i.deleted_at IS NULL
      GROUP BY pd.base_url_norm
    ),
    personal_last_share AS (
      SELECT pd.base_url_norm AS site_key, MAX(p.synced_at) AS last_share_dt
      FROM personal_drives pd
      JOIN msgraph_drive_item_permissions p ON p.drive_id = pd.id
      WHERE p.deleted_at IS NULL AND p.link_scope IS NOT NULL
      GROUP BY pd.base_url_norm
    ),
    sharepoint_rows AS (
      SELECT
        i.site_id,
        i.site_id AS site_key,
        COALESCE(g.group_name, i.title, i.site_id) AS title,
        i.web_url,
        i.created_dt,
        false AS is_personal,
        i.template,
        i.drive_count,
        i.storage_used_bytes,
        i.storage_total_bytes,
        i.last_write_dt,
        i.last_share_dt,
        i.last_activity_dt
      FROM mv_msgraph_site_inventory i
      LEFT JOIN sharepoint_group_names g ON g.site_id = i.site_id
      LEFT JOIN personal_groups pg
        ON i.web_url IS NOT NULL
       AND lower(trim(trailing '/' from i.web_url)) LIKE pg.site_key || '%'
      WHERE i.is_personal = false AND pg.site_key IS NULL
    ),
    personal_rows AS (
      SELECT
        pg.site_key,
        pg.site_key AS site_id,
        pg.title,
        pg.web_url,
        pg.created_dt,
        true AS is_personal,
        NULL::text AS template,
        pg.drive_count,
        pg.storage_used_bytes,
        pg.storage_total_bytes,
        plw.last_write_dt,
        pls.last_share_dt,
        GREATEST(plw.last_write_dt, pls.last_share_dt) AS last_activity_dt
      FROM personal_groups pg
      LEFT JOIN personal_last_write plw ON plw.site_key = pg.site_key
      LEFT JOIN personal_last_share pls ON pls.site_key = pg.site_key
    ),
    all_sites AS (
      SELECT * FROM sharepoint_rows
      UNION ALL
      SELECT * FROM personal_rows
    )
  `;

  const countRows = await query<any>(`${baseCte} SELECT COUNT(*)::int AS total FROM all_sites ${clause}`, params);
  const total = countRows[0]?.total || 0;

  const summaryRows = await query<any>(
    `
    ${baseCte}
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE created_dt >= now() - interval '30 days')::int AS new_30,
      COUNT(*) FILTER (WHERE created_dt >= now() - interval '90 days')::int AS new_90,
      COUNT(*) FILTER (WHERE is_personal = true)::int AS personal_count,
      COUNT(*) FILTER (WHERE is_personal = false)::int AS sharepoint_count
    FROM all_sites
    ${clause}
    `,
    params
  );

  const createdSeries = await query<any>(
    `
    ${baseCte}
    SELECT date_trunc('month', created_dt) AS month, COUNT(*)::int AS count
    FROM all_sites
    WHERE created_dt IS NOT NULL
    ${clause ? `AND ${clause.replace(/^WHERE\s+/i, "")}` : ""}
    GROUP BY date_trunc('month', created_dt)
    ORDER BY month DESC
    LIMIT 12
    `,
    params
  );

  const rows = await query<any>(
    `
    ${baseCte}
    SELECT site_key, site_id, title, web_url, created_dt, is_personal, template,
           storage_used_bytes, storage_total_bytes, last_activity_dt
    FROM all_sites
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
