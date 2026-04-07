import { query } from "@/app/lib/db";

export type AgentAccessLogRow = {
  id: number;
  occurred_at: string;
  action: "block" | "unblock";
  admin_upn: string | null;
  admin_name: string | null;
  bot_id: string;
  bot_name: string | null;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  reason: string | null;
};

function clampPositiveInt(value: number, fallback: number, min: number, max: number) {
  const normalized = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(Math.max(normalized, min), max);
}

export async function getAgentAccessLogCount(): Promise<number> {
  const rows = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM agent_access_revoke_log`
  );
  return rows[0]?.total || 0;
}

export async function getAgentAccessLogsPage(pageSize: number, offset: number): Promise<AgentAccessLogRow[]> {
  const safePageSize = clampPositiveInt(pageSize, 50, 1, 200);
  const safeOffset = clampPositiveInt(offset, 0, 0, 1_000_000_000);

  return query<AgentAccessLogRow>(
    `SELECT id, occurred_at, action, admin_upn, admin_name,
            bot_id, bot_name, user_id, user_name, user_email, reason
     FROM agent_access_revoke_log
     ORDER BY occurred_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [safePageSize, safeOffset]
  );
}

export type AgentAccessLogCursor = { occurredAt: string; id: number };

export async function getAgentAccessLogsBatchAfter(cursor: AgentAccessLogCursor | null, batchSize: number): Promise<AgentAccessLogRow[]> {
  const safeBatchSize = clampPositiveInt(batchSize, 500, 1, 2000);

  if (!cursor) {
    return query<AgentAccessLogRow>(
      `SELECT id, occurred_at, action, admin_upn, admin_name,
              bot_id, bot_name, user_id, user_name, user_email, reason
       FROM agent_access_revoke_log
       ORDER BY occurred_at DESC, id DESC
       LIMIT $1`,
      [safeBatchSize]
    );
  }

  return query<AgentAccessLogRow>(
    `SELECT id, occurred_at, action, admin_upn, admin_name,
            bot_id, bot_name, user_id, user_name, user_email, reason
     FROM agent_access_revoke_log
     WHERE (occurred_at, id) < ($1::timestamptz, $2::bigint)
     ORDER BY occurred_at DESC, id DESC
     LIMIT $3`,
    [cursor.occurredAt, cursor.id, safeBatchSize]
  );
}
