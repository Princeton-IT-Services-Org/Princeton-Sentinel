import { withPageRequestTiming } from "@/app/lib/request-timing";
import { requireAdmin } from "@/app/lib/auth";
import AdminOverviewClient from "@/app/admin/AdminOverviewClient";

async function AdminPage() {
  await requireAdmin();
  return <AdminOverviewClient />;
}

export default withPageRequestTiming("/admin", AdminPage);
