import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, SearchParams } from "@/app/lib/params";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";
import { SharingSummaryBarChartClient, SharingSummaryPieChartClient } from "@/components/sharing-summary-graphs-client";
import { SharingLinkBreakdownTable, SharingSitesTable } from "./sharing-tables";
import PageHeader from "@/components/page-header";
import FilterBar from "@/components/filter-bar";
import MetricGrid from "@/components/metric-grid";
import { MetricCard } from "@/components/metric-card";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause: "WHERE (LOWER(i.title) LIKE $1 OR LOWER(i.web_url) LIKE $1 OR LOWER(i.site_id) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export const dynamic = "force-dynamic";

export default async function SharingPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireUser();

  const search = getParam(searchParams, "q");
  const { page, pageSize, offset } = getPagination(searchParams, { page: 1, pageSize: 50 });
  const lbPage = Number(getParam(searchParams, "lbPage") || 1);
  const lbPageSize = Number(getParam(searchParams, "lbPageSize") || 10);
  const sort = getParam(searchParams, "sort") || "links";
  const dir = getSortDirection(searchParams, "desc");
  const externalThreshold = Number(getParam(searchParams, "externalThreshold") || 10);

  const sortMap: Record<string, string> = {
    site: "i.title",
    links: "s.sharing_links",
    anonymous: "s.anonymous_links",
    guests: "s.sharing_links",
    external: "s.sharing_links",
    lastShare: "s.last_shared_at",
  };
  const sortColumn = sortMap[sort] || "s.sharing_links";
  const { clause, params } = buildSearchFilter(search);

  const breakdownRows = await query<any>(
    `
    SELECT link_scope, link_type, count
    FROM mv_msgraph_link_breakdown
    ORDER BY count DESC
    LIMIT $1 OFFSET $2
    `,
    [lbPageSize, (lbPage - 1) * lbPageSize]
  );

  const breakdownAllRows = await query<any>(
    `
    SELECT link_scope, link_type, count
    FROM mv_msgraph_link_breakdown
    ORDER BY count DESC
    `
  );
  const totalLinksRows = await query<any>("SELECT SUM(count)::int AS total FROM mv_msgraph_link_breakdown");

  const topSites = await query<any>(
    `
    SELECT i.site_key, i.title, s.sharing_links
    FROM mv_msgraph_site_inventory i
    JOIN mv_msgraph_site_sharing_summary s ON s.site_key = i.site_key
    ORDER BY s.sharing_links DESC NULLS LAST
    LIMIT 10
    `
  );

  const countRows = await query<any>(`SELECT COUNT(*)::int AS total FROM mv_msgraph_site_inventory i ${clause}`, params);
  const total = countRows[0]?.total || 0;

  const siteRows = await query<any>(
    `
    SELECT
      i.site_key,
      i.site_id,
      i.title,
      i.web_url,
      i.is_personal,
      s.sharing_links,
      s.anonymous_links,
      s.organization_links,
      s.last_shared_at
    FROM mv_msgraph_site_inventory i
    LEFT JOIN mv_msgraph_site_sharing_summary s ON s.site_key = i.site_key
    ${clause}
    ORDER BY ${sortColumn} ${dir.toUpperCase()} NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `,
    [...params, pageSize, offset]
  );

  const patterns = getInternalDomainPatterns();
  const siteKeys = siteRows.map((row: any) => row.site_key);
  let externalMap = new Map<string, { guest_users: number; external_users: number }>();
  if (siteKeys.length) {
    const externalRows = await query<any>(
      `
      WITH selected AS (
        SELECT unnest($1::text[]) AS site_key
      ), grants AS (
        SELECT
          CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END AS site_key,
          COALESCE(g.principal_email, g.principal_user_principal_name) AS email
        FROM msgraph_drive_item_permission_grants g
        JOIN msgraph_drive_item_permissions p
          ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
        JOIN msgraph_drives d ON d.id = p.drive_id
        JOIN selected s ON s.site_key = CASE WHEN d.site_id IS NULL THEN 'drive:' || d.id ELSE d.site_id END
        WHERE g.deleted_at IS NULL AND p.deleted_at IS NULL AND d.deleted_at IS NULL
          AND COALESCE(g.principal_email, g.principal_user_principal_name) IS NOT NULL
      )
      SELECT
        site_key,
        COUNT(DISTINCT email) FILTER (WHERE email ILIKE '%#EXT#%')::int AS guest_users,
        COUNT(DISTINCT email) FILTER (
          WHERE email NOT ILIKE '%#EXT#%'
            AND COALESCE(array_length($2::text[], 1), 0) > 0
            AND NOT (split_part(lower(email), '@', 2) LIKE ANY($2::text[]))
        )::int AS external_users
      FROM grants
      GROUP BY site_key
      `,
      [siteKeys, patterns]
    );
    externalMap = new Map(
      externalRows.map((row: any) => [row.site_key, { guest_users: row.guest_users, external_users: row.external_users }])
    );
  }

  const totalLinks = totalLinksRows[0]?.total || 0;

  const totalSites = topSites.map((row: any) => ({ label: row.title || row.site_key, value: row.sharing_links || 0 }));
  const pieData = breakdownAllRows.map((row: any) => ({
    label: `${row.link_scope || "unknown"}:${row.link_type || "unknown"}`,
    value: row.count,
  }));

  const lbTotal = breakdownAllRows.length;

  const siteRowsEnriched = siteRows.map((row: any) => {
    const external = externalMap.get(row.site_key) || { guest_users: 0, external_users: 0 };
    return {
      ...row,
      distinctGuests: external.guest_users,
      distinctExternalUsers: external.external_users,
    };
  });

  return (
    <main className="ps-page">
      <PageHeader title="Sharing" subtitle="Sharing links and external access signals." />
      <form action="/dashboard/sharing" method="get">
        <FilterBar>
          <Input name="q" placeholder="Search sites…" defaultValue={search || ""} className="w-64" />
          <Input
            name="externalThreshold"
            type="number"
            min={0}
            max={10000}
            defaultValue={String(externalThreshold)}
            className="w-28"
            title="Oversharing threshold"
          />
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
        </FilterBar>
      </form>

      <MetricGrid className="md:grid-cols-2 lg:grid-cols-2">
        <MetricCard label="Total Links" value={formatNumber(totalLinks)} />
        <MetricCard label="Sites Evaluated" value={formatNumber(total)} />
      </MetricGrid>

      <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Top 10 Sites by Links</CardTitle>
          </CardHeader>
          <CardContent className="w-full flex items-center justify-center">
            <div className="w-full h-72 flex items-center justify-center">
              <SharingSummaryBarChartClient data={totalSites} label="Links" xTitle="Links" />
            </div>
          </CardContent>
        </Card>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Link Scope+Type Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="w-full flex items-center justify-center">
            <div className="w-full h-72 flex items-center justify-center">
              <SharingSummaryPieChartClient data={pieData} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Link breakdown</CardTitle>
          <CardDescription>From permissions link scope and type.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto space-y-3">
          <SharingLinkBreakdownTable breakdown={breakdownRows} />
          <Pagination
            pathname="/dashboard/sharing"
            page={lbPage}
            pageSize={lbPageSize}
            totalItems={lbTotal}
            pageParam="lbPage"
            pageSizeParam="lbPageSize"
            extraParams={{ q: search || undefined, externalThreshold, page, pageSize, sort, dir }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sites</CardTitle>
          <CardDescription>
            {formatNumber(total)} sites • showing {formatNumber(siteRowsEnriched.length)} • external threshold {externalThreshold}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SharingSitesTable sites={siteRowsEnriched} externalThreshold={externalThreshold} />
        </CardContent>
      </Card>

      <Pagination
        pathname="/dashboard/sharing"
        page={page}
        pageSize={pageSize}
        totalItems={total}
        extraParams={{ q: search || undefined, externalThreshold, pageSize, sort, dir, lbPage, lbPageSize }}
      />
    </main>
  );
}
