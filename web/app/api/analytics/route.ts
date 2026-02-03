import { NextResponse } from "next/server";
import { query } from "@/app/lib/db";
import { requireUser } from "@/app/lib/auth";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  const inventory = await query("SELECT * FROM mv_msgraph_inventory_summary LIMIT 1");
  const sharing = await query("SELECT * FROM mv_msgraph_sharing_posture_summary LIMIT 1");
  const refresh = await query("SELECT mv_name, last_refreshed_at FROM mv_refresh_log");
  return NextResponse.json({
    inventory: inventory[0] || {},
    sharing: sharing[0] || {},
    refresh,
  });
}
