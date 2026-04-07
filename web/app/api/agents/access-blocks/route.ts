import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { writeAuditEvent } from "@/app/lib/audit";
import {
  callWorker,
  isWorkerTimeoutError,
  parseWorkerErrorText,
} from "@/app/lib/worker-api";
import { getNonEmptyString, parseRequestBody } from "@/app/lib/request-body";
import { withApiRequestTiming } from "@/app/lib/request-timing";

export const dynamic = "force-dynamic";

// ── GET: list active blocks + available users/agents for dropdowns ──────

const getHandler = async function GET() {
  await requireAdmin();

  const [blocks, users, agents, registrations] = await Promise.all([
    query(
      `SELECT id, user_id, user_display_name, user_principal_name,
              bot_id, bot_name, block_scope, entra_policy_id,
              entra_sync_status, entra_sync_error, blocked_by, blocked_at, block_reason
       FROM copilot_access_blocks
       WHERE unblocked_at IS NULL
       ORDER BY blocked_at DESC`
    ),
    query(
      `SELECT DISTINCT user_id, MAX(bot_name) AS last_agent
       FROM copilot_sessions
       WHERE deleted_at IS NULL AND user_id IS NOT NULL
       GROUP BY user_id
       ORDER BY user_id`
    ),
    query(
      `SELECT DISTINCT bot_id, bot_name
       FROM copilot_sessions
       WHERE deleted_at IS NULL AND bot_id IS NOT NULL
       GROUP BY bot_id, bot_name
       ORDER BY bot_name`
    ),
    query(
      `SELECT bot_id, bot_name, app_registration_id, disabled_at, disabled_by, disabled_reason
       FROM copilot_agent_registrations
       ORDER BY bot_name`
    ),
  ]);

  return NextResponse.json({ blocks, users, agents, registrations });
};

// ── POST: block or unblock a user ──────────────────────────────────────

const postHandler = async function POST(req: Request) {
  const { session } = await requireAdmin();
  const parsed = await parseRequestBody(req);

  if (parsed.invalidJson) {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  const body = parsed.body;
  const action = getNonEmptyString(body.action);
  const userId = getNonEmptyString(body.user_id);
  const botId = getNonEmptyString(body.bot_id);
  const botName = getNonEmptyString(body.bot_name) || botId;
  const userDisplayName = getNonEmptyString(body.user_display_name) || userId;
  const userPrincipalName = getNonEmptyString(body.user_principal_name);
  const blockScope = getNonEmptyString(body.block_scope) || "agent";
  const blockReason = getNonEmptyString(body.block_reason) || null;
  const unblockReason = getNonEmptyString(body.unblock_reason) || null;

  if (!action || !["block", "unblock", "disable-agent", "enable-agent", "register-agent"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'block', 'unblock', 'disable-agent', 'enable-agent', or 'register-agent'" },
      { status: 400 }
    );
  }

  const actor = {
    oid: (session.user as any)?.oid,
    upn: (session.user as any)?.upn,
    name: session.user?.name,
  };
  const adminUpn = actor.upn || actor.oid || "unknown";

  // ── REGISTER AGENT ─────────────────────────────────────────────────
  if (action === "register-agent") {
    if (!botId) {
      return NextResponse.json({ error: "bot_id is required" }, { status: 400 });
    }
    const appRegistrationId = getNonEmptyString(body.app_registration_id);
    if (!appRegistrationId) {
      return NextResponse.json({ error: "app_registration_id is required" }, { status: 400 });
    }
    const existing = await query(
      `SELECT bot_id FROM copilot_agent_registrations WHERE bot_id = $1`,
      [botId]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "agent_already_registered" }, { status: 409 });
    }
    await query(
      `INSERT INTO copilot_agent_registrations (bot_id, bot_name, app_registration_id)
       VALUES ($1, $2, $3)`,
      [botId, botName, appRegistrationId]
    );
    await writeAuditEvent({
      action: "copilot_agent_registered",
      entityType: "copilot_agent",
      entityId: botId,
      actor,
      details: { bot_id: botId, bot_name: botName, app_registration_id: appRegistrationId },
    });
    return NextResponse.json({ status: "registered", bot_id: botId });
  }

  // ── DISABLE AGENT (global kill switch) ────────────────────────────
  if (action === "disable-agent") {
    if (!botId) {
      return NextResponse.json({ error: "bot_id is required" }, { status: 400 });
    }
    const reason = getNonEmptyString(body.reason) || "";
    const workerResult = await callWorkerCA("/conditional-access/disable-agent", {
      bot_id: botId,
      reason,
      actor,
    });
    await writeAuditEvent({
      action: "copilot_agent_disabled",
      entityType: "copilot_agent",
      entityId: botId,
      actor,
      details: { bot_id: botId, reason, worker_success: workerResult.success, worker_error: workerResult.error },
    });
    if (!workerResult.success) {
      return NextResponse.json({ error: workerResult.error || "disable_failed" }, { status: 502 });
    }
    return NextResponse.json({ status: "disabled", bot_id: botId });
  }

  // ── ENABLE AGENT (re-enable) ─────────────────────────────────────
  if (action === "enable-agent") {
    if (!botId) {
      return NextResponse.json({ error: "bot_id is required" }, { status: 400 });
    }
    const workerResult = await callWorkerCA("/conditional-access/enable-agent", {
      bot_id: botId,
      actor,
    });
    await writeAuditEvent({
      action: "copilot_agent_enabled",
      entityType: "copilot_agent",
      entityId: botId,
      actor,
      details: { bot_id: botId, worker_success: workerResult.success, worker_error: workerResult.error },
    });
    if (!workerResult.success) {
      return NextResponse.json({ error: workerResult.error || "enable_failed" }, { status: 502 });
    }
    return NextResponse.json({ status: "enabled", bot_id: botId });
  }

  if (!userId || !botId) {
    return NextResponse.json(
      { error: "user_id and bot_id are required" },
      { status: 400 }
    );
  }
  if (!["agent", "all"].includes(blockScope)) {
    return NextResponse.json(
      { error: "block_scope must be 'agent' or 'all'" },
      { status: 400 }
    );
  }

  const defaultSyncStatus = blockScope === "agent" ? "not_applicable" : "pending";

  // ── BLOCK ───────────────────────────────────────────────────────────
  if (action === "block") {
    const existing = await query(
      `SELECT id FROM copilot_access_blocks
       WHERE user_id = $1 AND bot_id = $2 AND unblocked_at IS NULL`,
      [userId, botId]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "user_already_blocked" },
        { status: 409 }
      );
    }

    await query(
      `INSERT INTO copilot_access_blocks
         (user_id, user_display_name, user_principal_name, bot_id, bot_name,
          block_scope, entra_sync_status, blocked_by, block_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, userDisplayName, userPrincipalName, botId, botName,
       blockScope, defaultSyncStatus, adminUpn, blockReason]
    );

    await query(
      `INSERT INTO agent_access_revoke_log
         (action, admin_upn, admin_name, bot_id, bot_name, user_id, user_name, user_email, reason)
       VALUES ('block', $1, $2, $3, $4, $5, $6, $7, $8)`,
      [adminUpn, actor.name || null, botId, botName, userId, userDisplayName, userPrincipalName || null, blockReason]
    );

    // Call worker (handles CA only for scope=all, audit for both)
    const workerResult = await callWorkerCA("/conditional-access/block", {
      user_id: userId,
      bot_id: botId,
      bot_name: botName,
      block_scope: blockScope,
      actor,
    });

    await writeAuditEvent({
      action: "copilot_user_blocked",
      entityType: "copilot_access_block",
      entityId: `${userId}:${botId}`,
      actor,
      details: {
        user_id: userId,
        bot_id: botId,
        block_scope: blockScope,
        worker_success: workerResult.success,
        worker_error: workerResult.error,
      },
    });

    return NextResponse.json({
      status: "blocked",
      block_scope: blockScope,
      entra_synced: blockScope === "all" ? workerResult.success : null,
      entra_error: blockScope === "all" ? workerResult.error : null,
    });
  }

  // ── UNBLOCK ─────────────────────────────────────────────────────────
  const updated = await query<{ id: number; block_scope: string; bot_name: string | null; user_display_name: string | null; user_principal_name: string | null }>(
    `UPDATE copilot_access_blocks
     SET unblocked_at = now(), unblocked_by = $3, unblock_reason = $4
     WHERE user_id = $1 AND bot_id = $2 AND unblocked_at IS NULL
     RETURNING id, block_scope, bot_name, user_display_name, user_principal_name`,
    [userId, botId, adminUpn, unblockReason]
  );

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "no_active_block_found" },
      { status: 404 }
    );
  }

  const unblockedScope = updated[0].block_scope;

  await query(
    `INSERT INTO agent_access_revoke_log
       (action, admin_upn, admin_name, bot_id, bot_name, user_id, user_name, user_email, reason)
     VALUES ('unblock', $1, $2, $3, $4, $5, $6, $7, $8)`,
    [adminUpn, actor.name || null, botId, updated[0].bot_name || botId, userId,
     updated[0].user_display_name || null, updated[0].user_principal_name || null, unblockReason]
  );

  // Call worker (handles CA cleanup only for scope=all)
  const workerResult = await callWorkerCA("/conditional-access/unblock", {
    user_id: userId,
    bot_id: botId,
    block_scope: unblockedScope,
    actor,
  });

  await writeAuditEvent({
    action: "copilot_user_unblocked",
    entityType: "copilot_access_block",
    entityId: `${userId}:${botId}`,
    actor,
    details: {
      user_id: userId,
      bot_id: botId,
      block_scope: unblockedScope,
      worker_success: workerResult.success,
      worker_error: workerResult.error,
    },
  });

  return NextResponse.json({
    status: "unblocked",
    block_scope: unblockedScope,
    entra_synced: unblockedScope === "all" ? workerResult.success : null,
    entra_error: unblockedScope === "all" ? workerResult.error : null,
  });
};

// ── Worker call helper ─────────────────────────────────────────────────

async function callWorkerCA(
  path: string,
  payload: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { res, text } = await callWorker(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = parseWorkerErrorText(text);
      return { success: false, error };
    }
    return { success: true };
  } catch (err: unknown) {
    if (isWorkerTimeoutError(err)) {
      return { success: false, error: "worker_request_timeout" };
    }
    const message = err instanceof Error ? err.message : "worker_request_failed";
    return { success: false, error: message };
  }
}

export const GET = withApiRequestTiming("/api/agents/access-blocks", getHandler);
export const POST = withApiRequestTiming("/api/agents/access-blocks", postHandler);
