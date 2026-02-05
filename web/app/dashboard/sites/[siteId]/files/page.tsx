import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { safeDecode } from "@/app/lib/format";

import { SiteLargestFilesTable, SiteMostPermissionedItemsTable, SiteRecentlyModifiedTable } from "./site-files-tables";
import { PERSONAL_DRIVES_CTE, resolveSite } from "../site-utils";

export const dynamic = "force-dynamic";

function Heatmap({ cells }: { cells: Array<{ dayOfWeek: number; hour: number; count: number }> }) {
  const byKey = new Map(cells.map((c) => [`${c.dayOfWeek}:${c.hour}`, c.count]));
  const max = Math.max(...cells.map((c) => c.count), 0);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-[64px_repeat(24,32px)] gap-1 text-xs">
          <div />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-center text-muted-foreground">
              {h}
            </div>
          ))}
          {weekdays.map((label, dayIdx) => (
            <div key={label} className="contents">
              <div className="flex items-center justify-end pr-2 text-muted-foreground">{label}</div>
              {Array.from({ length: 24 }).map((_, hour) => {
                const count = byKey.get(`${dayIdx}:${hour}`) ?? 0;
                const alpha = max <= 0 ? 0 : 0.08 + (count / max) * 0.75;
                return (
                  <div
                    key={`${label}:${hour}`}
                    title={`${label} ${hour}:00 — ${count.toLocaleString()} writes`}
                    className="h-6 rounded border"
                    style={{
                      backgroundColor: count > 0 ? `hsl(var(--primary) / ${alpha})` : "transparent",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function SiteFilesPage({ params }: { params: { siteId: string } }) {
  await requireUser();

  const rawId = safeDecode(params.siteId);
  const resolved = await resolveSite(rawId);
  if (!resolved) notFound();
  const site = resolved.site;
  const isPersonal = resolved.mode === "personal";
  const personalBaseUrl = resolved.personalBaseUrl || site.site_key;

  const heatmapRows = await query<any>(
    isPersonal
      ? `
        ${PERSONAL_DRIVES_CTE}
        SELECT EXTRACT(DOW FROM i.modified_dt)::int AS dow,
               EXTRACT(HOUR FROM i.modified_dt)::int AS hour,
               COUNT(*)::int AS count
        FROM msgraph_drive_items i
        JOIN personal_drives d ON d.id = i.drive_id
        WHERE i.deleted_at IS NULL
          AND i.modified_dt IS NOT NULL
        GROUP BY EXTRACT(DOW FROM i.modified_dt), EXTRACT(HOUR FROM i.modified_dt)
        ORDER BY dow, hour
        `
      : `
        SELECT EXTRACT(DOW FROM i.modified_dt)::int AS dow,
               EXTRACT(HOUR FROM i.modified_dt)::int AS hour,
               COUNT(*)::int AS count
        FROM msgraph_drive_items i
        JOIN msgraph_drives d ON d.id = i.drive_id
        WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
          AND d.site_id = $1
          AND i.modified_dt IS NOT NULL
        GROUP BY EXTRACT(DOW FROM i.modified_dt), EXTRACT(HOUR FROM i.modified_dt)
        ORDER BY dow, hour
        `,
    isPersonal ? [personalBaseUrl] : [site.site_id]
  );

  const recentlyModified = await query<any>(
    isPersonal
      ? `
        ${PERSONAL_DRIVES_CTE}
        SELECT i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.path, i.modified_dt
        FROM msgraph_drive_items i
        JOIN personal_drives d ON d.id = i.drive_id
        WHERE i.deleted_at IS NULL
        ORDER BY i.modified_dt DESC NULLS LAST
        LIMIT 25
        `
      : `
        SELECT i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.path, i.modified_dt
        FROM msgraph_drive_items i
        JOIN msgraph_drives d ON d.id = i.drive_id
        WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
          AND d.site_id = $1
        ORDER BY i.modified_dt DESC NULLS LAST
        LIMIT 25
        `,
    isPersonal ? [personalBaseUrl] : [site.site_id]
  );

  const largestFiles = await query<any>(
    isPersonal
      ? `
        ${PERSONAL_DRIVES_CTE}
        SELECT i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.path, i.size
        FROM msgraph_drive_items i
        JOIN personal_drives d ON d.id = i.drive_id
        WHERE i.deleted_at IS NULL
          AND i.is_folder = false
        ORDER BY i.size DESC NULLS LAST
        LIMIT 25
        `
      : `
        SELECT i.drive_id, i.id, i.name, i.web_url, i.normalized_path, i.path, i.size
        FROM msgraph_drive_items i
        JOIN msgraph_drives d ON d.id = i.drive_id
        WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
          AND d.site_id = $1
          AND i.is_folder = false
        ORDER BY i.size DESC NULLS LAST
        LIMIT 25
        `,
    isPersonal ? [personalBaseUrl] : [site.site_id]
  );

  const mostShared = await query<any>(
    isPersonal
      ? `
        ${PERSONAL_DRIVES_CTE}
        SELECT
          i.drive_id,
          i.id,
          i.name,
          i.web_url,
          COUNT(p.permission_id)::int AS permissions,
          COUNT(*) FILTER (WHERE p.link_scope IS NOT NULL)::int AS sharing_links
        FROM msgraph_drive_items i
        JOIN personal_drives d ON d.id = i.drive_id
        LEFT JOIN msgraph_drive_item_permissions p
          ON p.drive_id = i.drive_id AND p.item_id = i.id AND p.deleted_at IS NULL
        WHERE i.deleted_at IS NULL
        GROUP BY i.drive_id, i.id, i.name, i.web_url
        ORDER BY sharing_links DESC NULLS LAST, permissions DESC NULLS LAST
        LIMIT 25
        `
      : `
        SELECT
          i.drive_id,
          i.id,
          i.name,
          i.web_url,
          COUNT(p.permission_id)::int AS permissions,
          COUNT(*) FILTER (WHERE p.link_scope IS NOT NULL)::int AS sharing_links
        FROM msgraph_drive_items i
        JOIN msgraph_drives d ON d.id = i.drive_id
        LEFT JOIN msgraph_drive_item_permissions p
          ON p.drive_id = i.drive_id AND p.item_id = i.id AND p.deleted_at IS NULL
        WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
          AND d.site_id = $1
        GROUP BY i.drive_id, i.id, i.name, i.web_url
        ORDER BY sharing_links DESC NULLS LAST, permissions DESC NULLS LAST
        LIMIT 25
        `,
    isPersonal ? [personalBaseUrl] : [site.site_id]
  );

  const heatmap = heatmapRows.map((row: any) => ({
    dayOfWeek: row.dow,
    hour: row.hour,
    count: row.count,
  }));

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{site.title || site.site_id}: Files</h1>
          <p className="text-sm text-muted-foreground">File-level signals based on drive item metadata.</p>
          <p className="mt-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">Cached (DB)</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link className="text-muted-foreground hover:underline" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}`}>
            Overview
          </Link>
          <Link className="text-muted-foreground hover:underline" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}/sharing`}>
            Sharing
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Write heatmap</CardTitle>
          <CardDescription>Day-of-week × hour-of-day based on `lastModifiedDateTime`.</CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap cells={heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recently modified</CardTitle>
            <CardDescription>Latest writes</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <SiteRecentlyModifiedTable
              items={recentlyModified.map((row: any) => ({
                itemId: `${row.drive_id}::${row.id}`,
                name: row.name || row.id,
                webUrl: row.web_url,
                normalizedPath: row.normalized_path || row.path,
                lastModifiedDateTime: row.modified_dt,
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Largest files</CardTitle>
            <CardDescription>Top 25 by size</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <SiteLargestFilesTable
              items={largestFiles.map((row: any) => ({
                itemId: `${row.drive_id}::${row.id}`,
                name: row.name || row.id,
                webUrl: row.web_url,
                normalizedPath: row.normalized_path || row.path,
                size: row.size,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Most shared/permissioned items</CardTitle>
          <CardDescription>Ranked by sharing links and total permissions</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <SiteMostPermissionedItemsTable
            items={mostShared.map((row: any) => ({
              itemId: `${row.drive_id}::${row.id}`,
              name: row.name || row.id,
              webUrl: row.web_url,
              sharingLinks: row.sharing_links ?? 0,
              permissions: row.permissions ?? 0,
            }))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
