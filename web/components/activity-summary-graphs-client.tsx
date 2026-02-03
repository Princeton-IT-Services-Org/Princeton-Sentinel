"use client";
import { ActivityTopSitesBar, ActivityTopSitesSharesModsBar } from "@/components/activity-summary-graphs";
import React from "react";

export default function ActivitySummaryGraphsClient({
  topSitesByActiveUsers,
  topSitesBySharesMods,
  windowDays,
}: {
  topSitesByActiveUsers: { title: string; activeUsers: number }[];
  topSitesBySharesMods: { title: string; shares: number; mods: number }[];
  windowDays: number | null;
}) {
  return (
    <div className="w-full flex flex-col md:flex-row gap-6 items-center justify-center my-2">
      <ActivityTopSitesBar topSites={topSitesByActiveUsers} windowDays={windowDays} />
      <ActivityTopSitesSharesModsBar topSites={topSitesBySharesMods} windowDays={windowDays} />
    </div>
  );
}
