"use client";
import dynamic from "next/dynamic";

export const M365CopilotTrendChartClient = dynamic(
  () => import("./m365-copilot-charts").then((mod) => mod.M365CopilotTrendChart),
  { ssr: false }
);

export const M365CopilotAppPieChartClient = dynamic(
  () => import("./m365-copilot-charts").then((mod) => mod.M365CopilotAppPieChart),
  { ssr: false }
);

export const M365CopilotTimeOfDayChartClient = dynamic(
  () => import("./m365-copilot-charts").then((mod) => mod.M365CopilotTimeOfDayChart),
  { ssr: false }
);

export const M365CopilotAppTimeChartClient = dynamic(
  () => import("./m365-copilot-charts").then((mod) => mod.M365CopilotAppTimeChart),
  { ssr: false }
);
