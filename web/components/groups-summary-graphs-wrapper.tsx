"use client";
import dynamic from "next/dynamic";

export const GroupsSummaryBarChartClient = dynamic(
  () => import("./groups-summary-graphs").then((mod) => mod.GroupsSummaryBarChart),
  { ssr: false }
);

export const GroupsSummaryPieChartClient = dynamic(
  () => import("./groups-summary-graphs").then((mod) => mod.GroupsSummaryPieChart),
  { ssr: false }
);
