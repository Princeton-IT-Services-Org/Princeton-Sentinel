import { query } from "@/app/lib/db";

type RevokeLogOutcome = "success" | "failed";

export async function writeRevokePermissionLog(params: {
  actor?: { oid?: string; upn?: string; name?: string } | null;
  driveId?: string | null;
  itemId?: string | null;
  permissionId?: string | null;
  outcome: RevokeLogOutcome;
  failureReason?: string | null;
  warning?: string | null;
  source?: string;
  details?: Record<string, any>;
}) {
  const { actor, driveId, itemId, permissionId, outcome, failureReason, warning, source, details } = params;

  await query(
    `
    INSERT INTO revoke_permission_logs
      (occurred_at, actor_oid, actor_upn, actor_name, drive_id, item_id, permission_id, outcome, failure_reason, warning, source, details)
    VALUES
      (now(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      actor?.oid || null,
      actor?.upn || null,
      actor?.name || null,
      driveId || null,
      itemId || null,
      permissionId || null,
      outcome,
      failureReason || null,
      warning || null,
      source || "dashboard_file_drilldown",
      JSON.stringify(details || {}),
    ]
  );
}
