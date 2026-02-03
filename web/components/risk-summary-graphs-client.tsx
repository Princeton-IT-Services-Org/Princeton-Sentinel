"use client";
import dynamic from "next/dynamic";

export const RiskSummaryBarChartClient = dynamic(
  () => import("./risk-summary-graphs").then((mod) => mod.RiskSummaryBarChart),
  { ssr: false }
);

export const RiskSummaryPieChartClient = dynamic(
  () => import("./risk-summary-graphs").then((mod) => mod.RiskSummaryPieChart),
  { ssr: false }
);
