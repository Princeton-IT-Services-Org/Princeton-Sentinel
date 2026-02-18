import { NextResponse } from "next/server";
import { query } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/auth";
import { writeAuditEvent } from "@/app/lib/audit";
import { withApiRequestTiming } from "@/app/lib/request-timing";
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

const getHandler = async function GET() {
  await requireAdmin();
  const rows = await query(
    `
    SELECT job_id, job_type, tenant_id, config, enabled
    FROM jobs
    ORDER BY job_type
    `
  );
  return NextResponse.json({ jobs: rows });
};

const postHandler = async function POST(req: Request) {
  const { session } = await requireAdmin();
  const body: any = await parseBody(req);
  const action = body.action || "create";

  if (action === "create") {
    return NextResponse.json({ error: "job_creation_disabled" }, { status: 403 });
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

    return new NextResponse(null, { status: 303, headers: { Location: "/admin/jobs" } });
  }

  return NextResponse.json({ error: "unsupported_action" }, { status: 400 });
};

export const GET = withApiRequestTiming("/api/jobs", getHandler);
export const POST = withApiRequestTiming("/api/jobs", postHandler);
