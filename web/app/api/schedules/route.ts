import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/app/lib/db";
import { requireUser } from "@/app/lib/auth";
import { writeAuditEvent } from "@/app/lib/audit";
export const dynamic = "force-dynamic";

async function parseBody(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return req.json();
  }
  if (contentType.includes("form")) {
    const form = await req.formData();
    return Object.fromEntries(form.entries());
  }
  return {};
}

export async function GET() {
  await requireUser();
  const rows = await query(
    `
    SELECT schedule_id, job_id, cron_expr, next_run_at, enabled
    FROM job_schedules
    ORDER BY next_run_at
    `
  );
  return NextResponse.json({ schedules: rows });
}

export async function POST(req: Request) {
  const { session } = await requireUser();
  const body: any = await parseBody(req);
  const action = body.action || "create";

  if (action === "create") {
    const scheduleId = randomUUID();
    const jobId = body.job_id;
    const cronExpr = body.cron_expr;
    let nextRunAt = body.next_run_at || null;
    if (nextRunAt === "") {
      nextRunAt = null;
    }

    await query(
      `
      INSERT INTO job_schedules (schedule_id, job_id, cron_expr, next_run_at, enabled)
      VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()), $5)
      `,
      [scheduleId, jobId, cronExpr, nextRunAt, true]
    );

    await writeAuditEvent({
      action: "schedule_created",
      entityType: "job_schedule",
      entityId: scheduleId,
      actor: {
        oid: (session.user as any)?.oid,
        upn: (session.user as any)?.upn,
        name: session.user?.name || undefined,
      },
      details: { job_id: jobId, cron_expr: cronExpr },
    });

    return NextResponse.redirect(new URL("/jobs", req.url));
  }

  if (action === "toggle") {
    const scheduleId = body.schedule_id;
    const enabled = body.enabled === "true";
    await query("UPDATE job_schedules SET enabled = $1 WHERE schedule_id = $2", [enabled, scheduleId]);

    await writeAuditEvent({
      action: enabled ? "schedule_enabled" : "schedule_disabled",
      entityType: "job_schedule",
      entityId: scheduleId,
      actor: {
        oid: (session.user as any)?.oid,
        upn: (session.user as any)?.upn,
        name: session.user?.name || undefined,
      },
      details: {},
    });

    return NextResponse.redirect(new URL("/jobs", req.url));
  }

  return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
}
