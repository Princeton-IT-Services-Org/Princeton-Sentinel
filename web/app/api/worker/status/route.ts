import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/auth";
import { callWorker, isWorkerTimeoutError, parseWorkerErrorText } from "@/app/lib/worker-api";
import { withApiRequestTiming } from "@/app/lib/request-timing";
export const dynamic = "force-dynamic";

const getHandler = async function GET() {
  await requireAdmin();
  try {
    const { res, text } = await callWorker("/jobs/status");
    if (!res.ok) {
      return NextResponse.json(
        {
          error: "worker_status_failed",
          upstream_error: parseWorkerErrorText(text),
        },
        { status: res.status }
      );
    }
    try {
      const payload = text ? JSON.parse(text) : {};
      return NextResponse.json(payload, { status: 200 });
    } catch {
      return NextResponse.json({ error: "worker_invalid_json_response" }, { status: 502 });
    }
  } catch (err: unknown) {
    if (isWorkerTimeoutError(err)) {
      return NextResponse.json({ error: "worker_request_timeout" }, { status: 504 });
    }
    const message = err instanceof Error ? err.message : "worker_request_failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
};

export const GET = withApiRequestTiming("/api/worker/status", getHandler);
