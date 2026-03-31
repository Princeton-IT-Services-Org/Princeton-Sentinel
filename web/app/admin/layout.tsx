import AdminTabs from "@/app/admin/AdminTabs";
import AdminVersionBadge from "@/app/admin/AdminVersionBadge";
import { getAdminSubtitle } from "@/app/admin/copy";
import { isAdmin, requireAdmin } from "@/app/lib/auth";
import { getFeatureFlagsPayload } from "@/app/lib/feature-flags";
import { getAppVersion } from "@/app/lib/version";
import AppShell from "@/components/app-shell";
import PageHeader from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session, groups } = await requireAdmin();
  const userLabel = session.user?.name ?? session.user?.email ?? "Signed in";
  const canAdmin = isAdmin(groups);
  const appVersion = getAppVersion();
  const featureFlagsPayload = await getFeatureFlagsPayload();
  const subtitle = getAdminSubtitle(featureFlagsPayload.flags.test_mode);

  return (
    <AppShell
      userLabel={userLabel}
      canAdmin={canAdmin}
      initialFeatureFlags={featureFlagsPayload.flags}
      initialFeatureFlagVersion={featureFlagsPayload.version}
    >
      <main className="ps-page">
        <PageHeader
          title="Admin"
          subtitle={subtitle}
          actions={<AdminVersionBadge version={appVersion} />}
        />
        <AdminTabs />
        {children}
      </main>
    </AppShell>
  );
}
