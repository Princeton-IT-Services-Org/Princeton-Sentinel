import AdminTabs from "@/app/admin/AdminTabs";
import { requireAdmin } from "@/app/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <section className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate/60">Admin Console</div>
            <h1 className="font-display text-2xl text-ink">Operations & Controls</h1>
          </div>
        </div>
        <div className="mt-4">
          <AdminTabs />
        </div>
      </section>
      {children}
    </div>
  );
}
