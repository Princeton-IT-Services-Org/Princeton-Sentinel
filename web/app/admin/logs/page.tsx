import Link from "next/link";

import { requireAdmin } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LocalDateTime from "@/components/local-date-time";

type RevokeLogRow = {
  log_id: number;
  occurred_at: string;
  actor_oid: string | null;
  actor_upn: string | null;
  actor_name: string | null;
  drive_id: string | null;
  item_id: string | null;
  permission_id: string | null;
  outcome: "success" | "failed";
  failure_reason: string | null;
  warning: string | null;
  source: string;
  details: Record<string, any> | null;
  item_name: string | null;
  normalized_path: string | null;
  item_web_url: string | null;
};

function requestedBy(row: RevokeLogRow): string {
  return row.actor_name || row.actor_upn || row.actor_oid || "Unknown";
}

function itemPath(row: RevokeLogRow): string | null {
  if (!row.normalized_path && !row.item_name) return null;
  if (row.normalized_path && row.item_name) return `${row.normalized_path}/${row.item_name}`;
  return row.normalized_path || row.item_name;
}

function itemFallback(row: RevokeLogRow): string {
  if (row.drive_id && row.item_id) return `${row.drive_id}::${row.item_id}`;
  return row.item_id || row.drive_id || "Unknown item";
}

export default async function AdminLogsPage() {
  await requireAdmin();

  const rows = await query<RevokeLogRow>(
    `
    SELECT
      l.log_id,
      l.occurred_at,
      l.actor_oid,
      l.actor_upn,
      l.actor_name,
      l.drive_id,
      l.item_id,
      l.permission_id,
      l.outcome,
      l.failure_reason,
      l.warning,
      l.source,
      l.details,
      i.name AS item_name,
      i.normalized_path,
      i.web_url AS item_web_url
    FROM revoke_permission_logs l
    LEFT JOIN msgraph_drive_items i
      ON i.drive_id = l.drive_id
     AND i.id = l.item_id
    ORDER BY l.occurred_at DESC, l.log_id DESC
    LIMIT 300
    `
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revoke Activity Logs</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate/70">
            <tr>
              <th className="py-2">Triggered At</th>
              <th className="py-2">Requested By</th>
              <th className="py-2">File</th>
              <th className="py-2">Permission ID</th>
              <th className="py-2">Outcome</th>
              <th className="py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const detailHref =
                row.drive_id && row.item_id ? `/dashboard/items/${encodeURIComponent(`${row.drive_id}::${row.item_id}`)}` : null;
              const displayPath = itemPath(row);
              const displayItemName = row.item_name || itemFallback(row);
              const reason = row.failure_reason || row.warning || "--";
              return (
                <tr key={row.log_id} className="border-t">
                  <td className="py-3 text-slate">
                    <LocalDateTime value={row.occurred_at} />
                  </td>
                  <td className="py-3 text-ink">{requestedBy(row)}</td>
                  <td className="py-3">
                    <div className="max-w-[420px]">
                      <div className="font-medium text-ink">
                        {detailHref ? (
                          <Link className="hover:underline" href={detailHref}>
                            {displayItemName}
                          </Link>
                        ) : (
                          displayItemName
                        )}
                      </div>
                      {displayPath ? <div className="truncate text-xs text-slate">{displayPath}</div> : null}
                      {row.item_web_url ? (
                        <a className="text-xs text-slate hover:underline" href={row.item_web_url} target="_blank" rel="noreferrer">
                          Open in M365
                        </a>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-xs text-slate">{row.permission_id || "--"}</span>
                  </td>
                  <td className="py-3">
                    <span className={row.outcome === "success" ? "badge badge-ok" : "badge badge-error"}>
                      {row.outcome === "success" ? "Success" : "Failed"}
                    </span>
                  </td>
                  <td className="py-3 text-slate">{reason}</td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td className="py-8 text-center text-muted-foreground" colSpan={6}>
                  No revoke logs found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
