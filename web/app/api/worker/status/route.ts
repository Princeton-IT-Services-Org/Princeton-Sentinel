import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { withApiRequestTiming } from "@/app/lib/request-timing";
export const dynamic = "force-dynamic";

const getHandler = async function GET() {
  await requireAdmin();
  const base = process.env.WORKER_API_URL;
  if (!base) {
    return NextResponse.json({ error: "WORKER_API_URL not set" }, { status: 500 });
  }

  const res = await fetch(`${base}/jobs/status`, {
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, { status: res.status });
};

export const GET = withApiRequestTiming("/api/worker/status", getHandler);
