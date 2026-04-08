import MetricGrid from "@/components/metric-grid";
import { MetricCard } from "@/components/metric-card";

const OVERVIEW_METRIC_LINKS = [
  { label: "SharePoint Sites", key: "sites", href: "/dashboard/sites" },
  { label: "Active Users", key: "users", href: "/dashboard/users" },
  { label: "Groups", key: "groups", href: "/dashboard/groups" },
  { label: "Drives", key: "drives", href: "/dashboard/activity" },
] as const;

export function DashboardOverviewMetrics({
  totals,
}: {
  totals: { sites: number; users: number; groups: number; drives: number };
}) {
  return (
    <MetricGrid>
      {OVERVIEW_METRIC_LINKS.map((metric) => (
        <MetricCard key={metric.key} label={metric.label} value={totals[metric.key].toLocaleString()} href={metric.href} />
      ))}
    </MetricGrid>
  );
}
