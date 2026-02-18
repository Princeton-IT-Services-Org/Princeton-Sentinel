import { query } from "@/app/lib/db";
import { requireAdmin } from "@/app/lib/auth";
import AdminAnalyticsClient from "@/app/admin/AdminAnalyticsClient";

export default async function AnalyticsPage() {
  await requireAdmin();

  const inventoryRows = await query<any>("SELECT * FROM mv_msgraph_inventory_summary LIMIT 1");
  const sharingRows = await query<any>("SELECT * FROM mv_msgraph_sharing_posture_summary LIMIT 1");
  const refreshRows = await query<any>("SELECT mv_name, last_refreshed_at FROM mv_refresh_log");

  return <AdminAnalyticsClient initialData={{ inventory: inventoryRows[0] || {}, sharing: sharingRows[0] || {}, refresh: refreshRows }} />;
}
