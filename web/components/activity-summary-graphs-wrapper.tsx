"use client";
import dynamic from "next/dynamic";

const ActivitySummaryGraphsClient = dynamic(() => import("@/components/activity-summary-graphs-client"), { ssr: false });

export default function ActivitySummaryGraphsWrapper({
  topSitesByActiveUsers,
  topSitesBySharesMods,
  windowDays,
}: {
  topSitesByActiveUsers: { title: string; activeUsers: number }[];
  topSitesBySharesMods: { title: string; shares: number; mods: number }[];
  windowDays: number | null;
}) {
  return (
    <ActivitySummaryGraphsClient
      topSitesByActiveUsers={topSitesByActiveUsers}
      topSitesBySharesMods={topSitesBySharesMods}
      windowDays={windowDays}
    />
  );
}
