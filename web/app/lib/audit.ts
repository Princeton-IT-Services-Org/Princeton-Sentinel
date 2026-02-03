import { randomUUID } from "node:crypto";
import { query } from "@/app/lib/db";

export async function writeAuditEvent(params: {
  action: string;
  entityType: string;
  entityId: string;
  actor: { oid?: string; upn?: string; name?: string } | null;
  details?: Record<string, any>;
}) {
  const { action, entityType, entityId, actor, details } = params;
  const eventId = randomUUID();
  await query(
    `
    INSERT INTO audit_events
      (event_id, occurred_at, actor_oid, actor_upn, actor_name, action, entity_type, entity_id, details)
    VALUES
      ($1, now(), $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      eventId,
      actor?.oid || null,
      actor?.upn || null,
      actor?.name || null,
      action,
      entityType,
      entityId,
      JSON.stringify(details || {}),
    ]
  );
}
