import { withPageRequestTiming } from "@/app/lib/request-timing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatNumber } from "@/app/lib/format";
import { getPagination, getParam, getSortDirection, getWindowDays, SearchParams } from "@/app/lib/params";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";
import { DRIVE_SITE_KEY_EXPR, ROUTABLE_SITE_DRIVES_CTE } from "@/app/lib/site-drive-routing";
import { RiskTable } from "./risk-table";
import { RiskSummaryBarChartClient, RiskSummaryPieChartClient } from "@/components/risk-summary-graphs-client";
import PageHeader from "@/components/page-header";
import FilterBar from "@/components/filter-bar";

function buildSearchFilter(search: string | null) {
  if (!search) return { clause: "", params: [] as any[] };
  return {
    clause:
      "WHERE (LOWER(i.title) LIKE $1 OR LOWER(i.web_url) LIKE $1 OR LOWER(i.site_id) LIKE $1 OR LOWER(i.route_drive_id) LIKE $1 OR LOWER(i.site_key) LIKE $1)",
    params: [`%${search.toLowerCase()}%`],
  };
}

export const dynamic = "force-dynamic";

async function RiskPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await requireUser();

  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const search = getParam(resolvedSearchParams, "q");
  const scanLimit = Math.min(Math.max(Number(getParam(resolvedSearchParams, "scanLimit") || process.env.DASHBOARD_RISK_SCAN_LIMIT || 500), 50), 2000);
  const dormantDays = Number(getParam(resolvedSearchParams, "dormantDays") || process.env.DASHBOARD_DORMANT_LOOKBACK_DAYS || 90);
  const windowDays = getWindowDays(resolvedSearchParams, 90);
  const windowStart = windowDays ? new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString() : null;
  const { page, pageSize } = getPagination(resolvedSearchParams, { page: 1, pageSize: 50 });
  const sort = getParam(resolvedSearchParams, "sort") || "flags";
  const dir = getSortDirection(resolvedSearchParams, "desc");

  const sortMap: Record<string, string> = {
    site: "title",
    flags: "flag_count",
    storage: "storage_used_bytes",
    lastActivity: "last_activity_dt",
  };
  const sortColumn = sortMap[sort] || "flag_count";

  const { clause, params } = buildSearchFilter(search);

  const sites = await query<any>(
    `
    ${ROUTABLE_SITE_DRIVES_CTE}
    SELECT
      i.site_key,
      i.route_drive_id,
      i.title,
      i.web_url,
      i.is_personal,
      i.storage_used_bytes,
      i.storage_total_bytes,
      i.last_activity_dt,
      s.sharing_links,
      s.anonymous_links,
      s.organization_links
    FROM routable_site_drives i
    LEFT JOIN mv_msgraph_site_sharing_summary s ON s.site_key = i.site_key
    ${clause}
    ORDER BY i.last_activity_dt DESC NULLS LAST
    LIMIT $${params.length + 1}
    `,
    [...params, scanLimit]
  );

  const siteKeys = sites.map((row: any) => row.site_key);
  const patterns = getInternalDomainPatterns();
  let externalMap = new Map<string, { guest_users: number; external_users: number }>();
  if (siteKeys.length) {
    const externalRows = await query<any>(
      `
      WITH selected AS (
        SELECT unnest($1::text[]) AS site_key
      ), grants AS (
        SELECT
          ${DRIVE_SITE_KEY_EXPR} AS site_key,
          COALESCE(g.principal_email, g.principal_user_principal_name) AS email
        FROM msgraph_drive_item_permission_grants g
        JOIN msgraph_drive_item_permissions p
          ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
        JOIN msgraph_drives d ON d.id = p.drive_id
        JOIN selected s ON s.site_key = ${DRIVE_SITE_KEY_EXPR}
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
    externalMap = new Map(externalRows.map((row: any) => [row.site_key, { guest_users: row.guest_users, external_users: row.external_users }]));
  }

  const enrichedSites = sites.map((row: any) => {
    const external = externalMap.get(row.site_key) || { guest_users: 0, external_users: 0 };
    const dormant = !row.last_activity_dt || new Date(row.last_activity_dt).getTime() < Date.now() - dormantDays * 24 * 60 * 60 * 1000;
    const anonymousLinksSignal = (row.anonymous_links || 0) > 0;
    const orgLinksSignal = (row.organization_links || 0) > 0;
    const externalUsersSignal = external.external_users > 0;
    const guestUsersSignal = external.guest_users > 0;
    const flagCount = [dormant, anonymousLinksSignal, orgLinksSignal, externalUsersSignal, guestUsersSignal].filter(Boolean).length;
    return {
      ...row,
      dormant,
      anonymousLinksSignal,
      orgLinksSignal,
      externalUsersSignal,
      guestUsersSignal,
      guest_users: external.guest_users,
      external_users: external.external_users,
      flag_count: flagCount,
    };
  });

  const flaggedSites = enrichedSites.filter((site: any) => site.flag_count > 0);

  const sortedFlagged = [...flaggedSites].sort((a, b) => {
    if (sortColumn === "flag_count") return dir === "asc" ? a.flag_count - b.flag_count : b.flag_count - a.flag_count;
    if (sortColumn === "storage_used_bytes") return dir === "asc" ? a.storage_used_bytes - b.storage_used_bytes : b.storage_used_bytes - a.storage_used_bytes;
    if (sortColumn === "last_activity_dt") return dir === "asc" ? new Date(a.last_activity_dt || 0).getTime() - new Date(b.last_activity_dt || 0).getTime() : new Date(b.last_activity_dt || 0).getTime() - new Date(a.last_activity_dt || 0).getTime();
    return dir === "asc" ? (a.title || "").localeCompare(b.title || "") : (b.title || "").localeCompare(a.title || "");
  });

  const totalFlagged = sortedFlagged.length;
  const totalPages = Math.max(Math.ceil(totalFlagged / pageSize), 1);
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const pageItems = sortedFlagged.slice(start, start + pageSize);

  const anonymousItems = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.size, i.modified_dt, COUNT(*)::int AS link_shares, 'anonymous'::text AS link_scope
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drive_items i ON i.drive_id = p.drive_id AND i.id = p.item_id
    WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL AND p.link_scope = 'anonymous'
      ${windowStart ? "AND p.synced_at >= $1" : ""}
    GROUP BY i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.size, i.modified_dt
    ORDER BY link_shares DESC NULLS LAST
    LIMIT 25
    `,
    windowStart ? [windowStart] : []
  );

  const orgItems = await query<any>(
    `
    SELECT i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.size, i.modified_dt, COUNT(*)::int AS link_shares, 'organization'::text AS link_scope
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drive_items i ON i.drive_id = p.drive_id AND i.id = p.item_id
    WHERE p.deleted_at IS NULL AND i.deleted_at IS NULL AND p.link_scope = 'organization'
      ${windowStart ? "AND p.synced_at >= $1" : ""}
    GROUP BY i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.size, i.modified_dt
    ORDER BY link_shares DESC NULLS LAST
    LIMIT 25
    `,
    windowStart ? [windowStart] : []
  );

  const topSites = [...pageItems]
    .filter((s) => typeof s.storage_used_bytes === "number")
    .sort((a, b) => (b.storage_used_bytes || 0) - (a.storage_used_bytes || 0))
    .slice(0, 10)
    .map((s) => ({
      title: s.title ?? s.route_drive_id,
      storageGB: s.storage_used_bytes ? s.storage_used_bytes / 1024 / 1024 / 1024 : 0,
    }));

  const flagBreakdown: Record<string, number> = {
    Dormant: 0,
    "Anonymous links": 0,
    "Org-wide links": 0,
    "External principals": 0,
    "Multiple signals": 0,
  };
  for (const s of flaggedSites) {
    const principalSignal = s.externalUsersSignal || s.guestUsersSignal;
    const signals = Number(s.dormant) + Number(s.anonymousLinksSignal) + Number(s.orgLinksSignal) + Number(principalSignal);
    if (signals > 1) {
      flagBreakdown["Multiple signals"]++;
      continue;
    }
    if (s.anonymousLinksSignal) flagBreakdown["Anonymous links"]++;
    else if (s.orgLinksSignal) flagBreakdown["Org-wide links"]++;
    else if (principalSignal) flagBreakdown["External principals"]++;
    else if (s.dormant) flagBreakdown["Dormant"]++;
  }

  return (
    <main className="ps-page">
      <PageHeader
        title="Risk"
        subtitle={`Site-level risk signals with file-level exposure detail. File window: ${windowDays ?? "all"}d.`}
      />
      <form action="/dashboard/risk" method="get">
        <FilterBar>
          <Input name="q" placeholder="Search sites…" defaultValue={search || ""} className="w-64" />
          <select
            name="days"
            defaultValue={windowDays == null ? "all" : String(windowDays)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            title="File window"
          >
            <option value="all">All-time</option>
            <option value="30">30d</option>
            <option value="90">90d</option>
            <option value="365">365d</option>
          </select>
          <select
            name="dormantDays"
            defaultValue={String(dormantDays)}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            title="Dormant threshold"
          >
            <option value="30">Dormant 30d+</option>
            <option value="90">Dormant 90d+</option>
            <option value="180">Dormant 180d+</option>
            <option value="365">Dormant 365d+</option>
          </select>
          <Input name="scanLimit" type="number" min={50} max={2000} defaultValue={String(scanLimit)} className="w-28" title="Scan limit" />
          <Input name="pageSize" type="number" min={10} max={200} defaultValue={String(pageSize)} className="w-24" title="Page size" />
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </FilterBar>
      </form>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(totalFlagged)}</CardTitle>
            <CardDescription>Flagged sites</CardDescription>
          </CardHeader>
        </Card>
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(anonymousItems.length)}</CardTitle>
            <CardDescription>Files w/ anonymous links</CardDescription>
          </CardHeader>
        </Card>
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(orgItems.length)}</CardTitle>
            <CardDescription>Files w/ org links</CardDescription>
          </CardHeader>
        </Card>
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-3xl font-bold">{formatNumber(sites.length)}</CardTitle>
            <CardDescription>Sites scanned</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="w-full flex flex-col md:flex-row gap-6 items-center justify-center my-2">
        <RiskSummaryBarChartClient topSites={topSites} />
        <RiskSummaryPieChartClient flagBreakdown={flagBreakdown} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Flagged sites</CardTitle>
          <CardDescription>
            {formatNumber(totalFlagged)} sites • showing {formatNumber(pageItems.length)}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <RiskTable items={pageItems} />
        </CardContent>
      </Card>

      <Pagination
        pathname="/dashboard/risk"
        page={clampedPage}
        pageSize={pageSize}
        totalItems={totalFlagged}
        extraParams={{ q: search || undefined, pageSize, sort, dir, scanLimit, dormantDays, days: windowDays == null ? "all" : windowDays }}
      />

    </main>
  );
}

export default withPageRequestTiming("/dashboard/risk", RiskPage);
