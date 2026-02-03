import Link from "next/link";
import { requireUser } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate, formatNumber, safeDecode } from "@/app/lib/format";
import { getInternalDomainPatterns } from "@/app/lib/internalDomains";

function itemKey(driveId: string, itemId: string) {
  return encodeURIComponent(`${driveId}::${itemId}`);
}

export default async function SiteSharingPage({ params }: { params: { siteId: string } }) {
  await requireUser();

  const rawId = safeDecode(params.siteId);
  const siteRows = await query<any>("SELECT * FROM mv_msgraph_site_inventory WHERE site_key = $1", [rawId]);
  if (!siteRows.length) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-2xl">Site not found</h2>
      </div>
    );
  }
  const site = siteRows[0];
  const isPersonal = site.is_personal === true;

  const linkBreakdown = await query<any>(
    `
    SELECT p.link_scope, p.link_type, COUNT(*)::int AS count
    FROM msgraph_drive_item_permissions p
    JOIN msgraph_drives d ON d.id = p.drive_id
    WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
    GROUP BY p.link_scope, p.link_type
    ORDER BY count DESC
    `,
    [site.site_id]
  );

  const patterns = getInternalDomainPatterns();
  const externalPrincipals = await query<any>(
    `
    WITH grants AS (
      SELECT
        COALESCE(g.principal_email, g.principal_user_principal_name) AS email,
        MAX(p.synced_at) AS last_grant,
        COUNT(*)::int AS grants
      FROM msgraph_drive_item_permission_grants g
      JOIN msgraph_drive_item_permissions p
        ON p.drive_id = g.drive_id AND p.item_id = g.item_id AND p.permission_id = g.permission_id
      JOIN msgraph_drives d ON d.id = p.drive_id
      WHERE g.deleted_at IS NULL AND p.deleted_at IS NULL AND d.deleted_at IS NULL
        AND ${isPersonal ? "d.id" : "d.site_id"} = $1
        AND COALESCE(g.principal_email, g.principal_user_principal_name) IS NOT NULL
      GROUP BY COALESCE(g.principal_email, g.principal_user_principal_name)
    ), classified AS (
      SELECT
        email,
        grants,
        last_grant,
        CASE
          WHEN email ILIKE '%#EXT#%' THEN 'guest'
          WHEN COALESCE(array_length($2::text[], 1), 0) > 0
            AND NOT (split_part(lower(email), '@', 2) LIKE ANY($2::text[])) THEN 'external'
          ELSE 'internal'
        END AS kind
      FROM grants
    )
    SELECT email, kind, grants, last_grant
    FROM classified
    WHERE kind IN ('guest', 'external')
    ORDER BY grants DESC
    LIMIT 25
    `,
    [site.site_id, patterns]
  );

  const mostShared = await query<any>(
    `
    SELECT
      i.drive_id,
      i.id,
      i.name,
      i.web_url,
      COUNT(p.permission_id)::int AS permissions,
      COUNT(*) FILTER (WHERE p.link_scope IS NOT NULL)::int AS sharing_links,
      MAX(p.synced_at) AS last_shared
    FROM msgraph_drive_items i
    JOIN msgraph_drives d ON d.id = i.drive_id
    LEFT JOIN msgraph_drive_item_permissions p
      ON p.drive_id = i.drive_id AND p.item_id = i.id AND p.deleted_at IS NULL
    WHERE i.deleted_at IS NULL AND d.deleted_at IS NULL
      AND ${isPersonal ? "d.id" : "d.site_id"} = $1
    GROUP BY i.drive_id, i.id, i.name, i.web_url
    ORDER BY sharing_links DESC NULLS LAST, permissions DESC NULLS LAST
    LIMIT 25
    `,
    [site.site_id]
  );

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl">{site.title || site.site_id} — Sharing</h2>
            <div className="text-sm text-slate">Link breakdown and external principals.</div>
          </div>
          <Link className="badge bg-white/70 text-slate hover:bg-white" href={`/dashboard/sites/${encodeURIComponent(site.site_key)}`}>
            Back to Site
          </Link>
        </div>
      </section>

      <section className="card p-6">
        <h3 className="font-display text-xl">Link Breakdown</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Scope</th>
                <th className="py-2">Type</th>
                <th className="py-2">Count</th>
              </tr>
            </thead>
            <tbody>
              {linkBreakdown.map((row: any) => (
                <tr key={`${row.link_scope || "null"}-${row.link_type || "null"}`} className="border-t border-white/60">
                  <td className="py-3 text-ink">{row.link_scope || "(direct)"}</td>
                  <td className="py-3 text-slate">{row.link_type || "--"}</td>
                  <td className="py-3 text-slate">{formatNumber(row.count)}</td>
                </tr>
              ))}
              {!linkBreakdown.length && (
                <tr>
                  <td className="py-3 text-slate" colSpan={3}>
                    No sharing links recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">External Principals</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Email</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">Grants</th>
                  <th className="py-2">Last Grant</th>
                </tr>
              </thead>
              <tbody>
                {externalPrincipals.map((row: any) => (
                  <tr key={row.email} className="border-t border-white/60">
                    <td className="py-3 text-ink">{row.email}</td>
                    <td className="py-3 text-slate">{row.kind}</td>
                    <td className="py-3 text-slate">{formatNumber(row.grants)}</td>
                    <td className="py-3 text-slate">{formatDate(row.last_grant)}</td>
                  </tr>
                ))}
                {!externalPrincipals.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={4}>
                      No guest or external principals detected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Most Shared Items</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate/70">
                <tr>
                  <th className="py-2">Item</th>
                  <th className="py-2">Sharing Links</th>
                  <th className="py-2">Permissions</th>
                  <th className="py-2">Last Shared</th>
                </tr>
              </thead>
              <tbody>
                {mostShared.map((row: any) => (
                  <tr key={`${row.drive_id}-${row.id}`} className="border-t border-white/60">
                    <td className="py-3">
                      <Link className="font-semibold text-ink underline decoration-dotted" href={`/dashboard/items/${itemKey(row.drive_id, row.id)}`}>
                        {row.name || row.id}
                      </Link>
                    </td>
                    <td className="py-3 text-slate">{formatNumber(row.sharing_links)}</td>
                    <td className="py-3 text-slate">{formatNumber(row.permissions)}</td>
                    <td className="py-3 text-slate">{formatDate(row.last_shared)}</td>
                  </tr>
                ))}
                {!mostShared.length && (
                  <tr>
                    <td className="py-3 text-slate" colSpan={4}>
                      No sharing activity.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
