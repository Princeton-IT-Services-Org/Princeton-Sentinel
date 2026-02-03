"use client";
import dynamic from "next/dynamic";

export const SharingSummaryBarChartClient = dynamic(
  () => import("./sharing-summary-graphs").then((mod) => mod.SharingSummaryBarChart),
  { ssr: false }
);

export const SharingSummaryPieChartClient = dynamic(
  () => import("./sharing-summary-graphs").then((mod) => mod.SharingSummaryPieChart),
  { ssr: false }
);
