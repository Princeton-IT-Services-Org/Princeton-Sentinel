import { NextResponse } from "next/server";
import { requireUser } from "@/app/lib/auth";
import { graphGet } from "@/app/lib/graph";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const driveId = searchParams.get("driveId");
  const itemId = searchParams.get("itemId");
  if (!driveId || !itemId) {
    return NextResponse.json({ error: "driveId_and_itemId_required" }, { status: 400 });
  }

  try {
    const data = await graphGet(`/drives/${driveId}/items/${itemId}?select=id,name,webUrl,shared`);
    return NextResponse.json({ mode: "live", data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
