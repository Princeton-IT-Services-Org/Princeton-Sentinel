"use client";
import dynamic from "next/dynamic";

export const DashboardTotalsBarChartClient = dynamic(
  () => import("./dashboard-totals-bar-chart").then((mod) => mod.DashboardTotalsBarChart),
  { ssr: false }
) as React.FC<{ totals: { sites: number; users: number; groups: number; drives: number } }>;
