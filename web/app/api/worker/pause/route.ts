import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
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

export async function POST(req: Request) {
  const { session } = await requireAdmin();
  const base = process.env.WORKER_API_URL;
  if (!base) {
    return NextResponse.json({ error: "WORKER_API_URL not set" }, { status: 500 });
  }

  const body: any = await parseBody(req);
  const jobId = body.job_id;
  if (!jobId) {
    return NextResponse.json({ error: "job_id_required" }, { status: 400 });
  }

  await fetch(`${base}/jobs/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      job_id: jobId,
      actor: {
        oid: (session.user as any)?.oid,
        upn: (session.user as any)?.upn,
        name: session.user?.name,
      },
    }),
  });

  return new NextResponse(null, { status: 303, headers: { Location: "/admin" } });
}
