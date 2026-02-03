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
    SELECT job_id, job_type, tenant_id, config, enabled
    FROM jobs
    ORDER BY job_type
    `
  );
  return NextResponse.json({ jobs: rows });
}

export async function POST(req: Request) {
  const { session } = await requireUser();
  const body: any = await parseBody(req);
  const action = body.action || "create";

  if (action === "create") {
    const jobType = body.job_type;
    const configRaw = (body.config || "").toString().trim();
    let config = {};
    try {
      config = configRaw ? JSON.parse(configRaw) : {};
    } catch {
      return NextResponse.json({ error: "invalid_config_json" }, { status: 400 });
    }

    const jobId = randomUUID();
    await query(
      `
      INSERT INTO jobs (job_id, job_type, tenant_id, config, enabled)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [jobId, jobType, "default", JSON.stringify(config), true]
    );

    await writeAuditEvent({
      action: "job_created",
      entityType: "job",
      entityId: jobId,
      actor: {
        oid: (session.user as any)?.oid,
        upn: (session.user as any)?.upn,
        name: session.user?.name || undefined,
      },
      details: { job_type: jobType },
    });

    return NextResponse.redirect(new URL("/jobs", req.url));
  }

  if (action === "toggle") {
    const jobId = body.job_id;
    const enabled = body.enabled === "true";
    await query("UPDATE jobs SET enabled = $1 WHERE job_id = $2", [enabled, jobId]);

    await writeAuditEvent({
      action: enabled ? "job_enabled" : "job_disabled",
      entityType: "job",
      entityId: jobId,
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
