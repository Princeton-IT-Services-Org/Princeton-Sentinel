import AdminTabs from "@/app/admin/AdminTabs";
import { isAdmin, requireAdmin } from "@/app/lib/auth";
import AppShell from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, groups } = await requireAdmin();
  const userLabel = session.user?.name ?? session.user?.email ?? "Signed in";
  const canAdmin = isAdmin(groups);

  return (
    <AppShell userLabel={userLabel} canAdmin={canAdmin}>
      <main className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Admin</h1>
            <p className="text-sm text-muted-foreground">Operations & controls for ingestion, schedules, and worker health.</p>
          </div>
        </div>
        <AdminTabs />
        {children}
      </main>
    </AppShell>
  );
}
