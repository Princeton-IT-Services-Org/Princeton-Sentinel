import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/auth";
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
  await requireAdmin();
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
  const { session } = await requireAdmin();
  const body: any = await parseBody(req);
  const action = body.action || "create";

  if (action === "create") {
    const scheduleId = randomUUID();
    const jobId = body.job_id;
    const cronExpr = body.cron_expr;
    if (!jobId || !cronExpr) {
      return NextResponse.json({ error: "job_id_and_cron_expr_required" }, { status: 400 });
    }

    const existing = await query(
      `
      SELECT schedule_id
      FROM job_schedules
      WHERE job_id = $1
      LIMIT 1
      `,
      [jobId]
    );
    if (existing.length) {
      return NextResponse.json({ error: "schedule_exists_for_job", schedule_id: existing[0].schedule_id }, { status: 409 });
    }

    let nextRunAt = body.next_run_at || null;
    if (nextRunAt === "") {
      nextRunAt = null;
    }

    try {
      await query(
        `
        INSERT INTO job_schedules (schedule_id, job_id, cron_expr, next_run_at, enabled)
        VALUES ($1, $2, $3, $4::timestamptz, $5)
        `,
        [scheduleId, jobId, cronExpr, nextRunAt, true]
      );
    } catch (err: any) {
      if (err?.code === "23505") {
        return NextResponse.json({ error: "schedule_exists_for_job" }, { status: 409 });
      }
      throw err;
    }

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

    return new NextResponse(null, { status: 303, headers: { Location: "/admin/jobs" } });
  }

  if (action === "toggle") {
    const scheduleId = body.schedule_id;
    const enabled = body.enabled === "true";
    await query("UPDATE job_schedules SET enabled = $1, next_run_at = NULL WHERE schedule_id = $2", [enabled, scheduleId]);

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

    return new NextResponse(null, { status: 303, headers: { Location: "/admin/jobs" } });
  }

  if (action === "update") {
    const scheduleId = body.schedule_id;
    const cronExpr = (body.cron_expr || "").toString().trim();
    if (!scheduleId || !cronExpr) {
      return NextResponse.json({ error: "schedule_id_and_cron_expr_required" }, { status: 400 });
    }

    let nextRunAt = body.next_run_at || null;
    if (nextRunAt === "") {
      nextRunAt = null;
    }
    let enabled: boolean | null = null;
    if (body.enabled === "true") enabled = true;
    if (body.enabled === "false") enabled = false;

    const rows = await query<any>(
      `
      UPDATE job_schedules
      SET cron_expr = $1,
          next_run_at = $2::timestamptz,
          enabled = COALESCE($3::boolean, enabled)
      WHERE schedule_id = $4
      RETURNING schedule_id, job_id
      `,
      [cronExpr, nextRunAt, enabled, scheduleId]
    );
    if (!rows.length) {
      return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
    }

    await writeAuditEvent({
      action: "schedule_updated",
      entityType: "job_schedule",
      entityId: scheduleId,
      actor: {
        oid: (session.user as any)?.oid,
        upn: (session.user as any)?.upn,
        name: session.user?.name || undefined,
      },
      details: {
        job_id: rows[0].job_id,
        cron_expr: cronExpr,
        next_run_at: nextRunAt,
        enabled,
      },
    });

    return new NextResponse(null, { status: 303, headers: { Location: "/admin/jobs" } });
  }

  if (action === "delete") {
    const scheduleId = body.schedule_id;
    if (!scheduleId) {
      return NextResponse.json({ error: "schedule_id_required" }, { status: 400 });
    }

    const rows = await query<any>(
      `
      DELETE FROM job_schedules
      WHERE schedule_id = $1
      RETURNING schedule_id, job_id, cron_expr
      `,
      [scheduleId]
    );
    if (!rows.length) {
      return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
    }

    await writeAuditEvent({
      action: "schedule_deleted",
      entityType: "job_schedule",
      entityId: scheduleId,
      actor: {
        oid: (session.user as any)?.oid,
        upn: (session.user as any)?.upn,
        name: session.user?.name || undefined,
      },
      details: {
        job_id: rows[0].job_id,
        cron_expr: rows[0].cron_expr,
      },
    });

    return new NextResponse(null, { status: 303, headers: { Location: "/admin/jobs" } });
  }

  return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
}
