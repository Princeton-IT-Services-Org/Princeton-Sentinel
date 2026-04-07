import { NextResponse } from "next/server";
import { query } from "@/app/lib/db";
import { withApiRequestTiming } from "@/app/lib/request-timing";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Public-ish endpoint called by Copilot Studio agents at conversation start.
 * Secured by a shared API key (AGENT_ACCESS_CHECK_API_KEY) passed in the
 * x-api-key header — NOT Entra auth, since Copilot Studio uses HTTP connectors.
 *
 * GET /api/agents/access-check?user_id=<oid>&bot_id=<bot_id>
 *
 * Returns: { blocked: true/false, reason?: string }
 */

function isValidApiKey(provided: string | null): boolean {
  const expected = process.env.AGENT_ACCESS_CHECK_API_KEY || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const getHandler = async function GET(req: Request) {
  // ── API key check ──
  const apiKey = req.headers.get("x-api-key");
  if (!isValidApiKey(apiKey)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get("user_id") || "").trim();
  const botId = (searchParams.get("bot_id") || "").trim();

  if (!userId || !botId) {
    return NextResponse.json(
      { error: "user_id and bot_id query params are required" },
      { status: 400 }
    );
  }

  // Check for any active block: either specific to this agent OR scope=all
  const rows = await query<{ id: number; block_scope: string; bot_id: string }>(
    `SELECT id, block_scope, bot_id
     FROM copilot_access_blocks
     WHERE user_id = $1
       AND (bot_id = $2 OR block_scope = 'all')
       AND unblocked_at IS NULL
     LIMIT 1`,
    [userId, botId]
  );

  if (rows.length > 0) {
    const block = rows[0];
    const reason =
      block.block_scope === "all"
        ? "User is blocked from all agents"
        : "User is blocked from this agent";
    return NextResponse.json({ blocked: true, reason });
  }

  return NextResponse.json({ blocked: false });
};

export const GET = withApiRequestTiming("/api/agents/access-check", getHandler);
