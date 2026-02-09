import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      await req.json();
    } catch {
      // Ignore invalid payloads; endpoint is liveness-only.
    }
  }
  return NextResponse.json({ ok: true, received_at: new Date().toISOString() });
}
