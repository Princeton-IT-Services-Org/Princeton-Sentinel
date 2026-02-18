import { NextResponse } from "next/server";
import { withApiRequestTiming } from "@/app/lib/request-timing";
export const dynamic = "force-dynamic";

const postHandler = async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      await req.json();
    } catch {
      // Ignore invalid payloads; endpoint is liveness-only.
    }
  }
  return NextResponse.json({ ok: true, received_at: new Date().toISOString() });
};

export const POST = withApiRequestTiming("/api/internal/worker-heartbeat", postHandler);
