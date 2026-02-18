import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";

export const dynamic = "force-dynamic";

async function parseJsonOrText(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

export async function GET() {
  await requireAdmin();
  const base = process.env.WORKER_API_URL;
  if (!base) {
    return NextResponse.json({ error: "WORKER_API_URL not set" }, { status: 500 });
  }

  const [healthRes, jobsRes] = await Promise.all([
    fetch(`${base}/health`, { cache: "no-store" }),
    fetch(`${base}/jobs/status`, { cache: "no-store" }),
  ]);

  const [healthPayload, jobsPayload] = await Promise.all([parseJsonOrText(healthRes), parseJsonOrText(jobsRes)]);

  if (!healthRes.ok || !jobsRes.ok) {
    return NextResponse.json(
      {
        error: "worker_overview_failed",
        health_error: healthRes.ok ? null : healthPayload.text || `HTTP ${healthRes.status}`,
        jobs_error: jobsRes.ok ? null : jobsPayload.text || `HTTP ${jobsRes.status}`,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    health: healthPayload.json || {},
    jobs: Array.isArray(jobsPayload.json?.jobs) ? jobsPayload.json.jobs : [],
  });
}
