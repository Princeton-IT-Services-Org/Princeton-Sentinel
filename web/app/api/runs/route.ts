import { NextResponse } from "next/server";
import { query } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/auth";
import { withApiRequestTiming } from "@/app/lib/request-timing";
export const dynamic = "force-dynamic";

const getHandler = async function GET() {
  await requireAdmin();
  const rows = await query(
    `
    SELECT
      r.run_id,
      r.job_id,
      r.started_at,
      r.finished_at,
      r.status,
      r.error,
      j.job_type,
      l.logged_at AS last_log_at,
      l.level AS last_log_level,
      l.message AS last_log_message
    FROM job_runs r
    LEFT JOIN jobs j ON j.job_id = r.job_id
    LEFT JOIN LATERAL (
      SELECT logged_at, level, message
      FROM job_run_logs
      WHERE run_id = r.run_id
      ORDER BY logged_at DESC, log_id DESC
      LIMIT 1
    ) l ON true
    ORDER BY r.started_at DESC
    LIMIT 200
    `
  );
  return NextResponse.json({ runs: rows });
};

export const GET = withApiRequestTiming("/api/runs", getHandler);
