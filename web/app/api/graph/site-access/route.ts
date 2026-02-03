import { NextResponse } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { graphGet } from "@/app/lib/graph";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId_required" }, { status: 400 });
  }

  try {
    const data = await graphGet(`/sites/${siteId}/permissions`);
    return NextResponse.json({ mode: "live", data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
