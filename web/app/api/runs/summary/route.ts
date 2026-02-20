import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/lib/auth";
import { withApiRequestTiming } from "@/app/lib/request-timing";
import { getLatestRunsByType } from "@/app/admin/runs/run-data";

export const dynamic = "force-dynamic";

const getHandler = async function GET() {
  await requireAdmin();
  const runs = await getLatestRunsByType();
  return NextResponse.json({ runs });
};

export const GET = withApiRequestTiming("/api/runs/summary", getHandler);
