import { requireAdmin } from "@/app/lib/auth";
import AdminOverviewClient from "@/app/admin/AdminOverviewClient";

export default async function AdminPage() {
  await requireAdmin();
  return <AdminOverviewClient />;
}
