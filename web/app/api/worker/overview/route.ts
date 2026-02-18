import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";
import { withApiRequestTiming } from "@/app/lib/request-timing";

export const dynamic = "force-dynamic";

async function parseJsonOrText(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

type SafeWorkerFetchResult = {
  ok: boolean;
  status?: number;
  payload?: any;
  error?: string;
};

async function safeWorkerFetch(url: string): Promise<SafeWorkerFetchResult> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const parsed = await parseJsonOrText(res);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: parsed.text || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, payload: parsed.json };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "worker_unreachable",
    };
  }
}

const getHandler = async function GET() {
  await requireAdmin();
  const base = process.env.WORKER_API_URL;
  if (!base) {
    return NextResponse.json({ error: "WORKER_API_URL not set" }, { status: 500 });
  }

  const [healthRes, jobsRes] = await Promise.all([
    safeWorkerFetch(`${base}/health`),
    safeWorkerFetch(`${base}/jobs/status`),
  ]);

  const healthPayload = healthRes.ok ? healthRes.payload || {} : null;
  const jobsPayload = jobsRes.ok ? jobsRes.payload || {} : null;
  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];

  if (!healthRes.ok || !jobsRes.ok) {
    return NextResponse.json(
      {
        error: "worker_overview_failed",
        health_error: healthRes.ok ? null : healthRes.error || `HTTP ${healthRes.status || 502}`,
        jobs_error: jobsRes.ok ? null : jobsRes.error || `HTTP ${jobsRes.status || 502}`,
        health: healthPayload || {},
        jobs,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    health: healthPayload || {},
    jobs,
  });
};

export const GET = withApiRequestTiming("/api/worker/overview", getHandler);
