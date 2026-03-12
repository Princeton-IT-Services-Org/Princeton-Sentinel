"use client";
import dynamic from "next/dynamic";

export const CopilotSessionsBarChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotSessionsBarChart),
  { ssr: false }
);

export const CopilotOutcomePieChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotOutcomePieChart),
  { ssr: false }
);

export const CopilotEventBreakdownBarChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotEventBreakdownBarChart),
  { ssr: false }
);

export const CopilotDailyUsersAreaChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotDailyUsersAreaChart),
  { ssr: false }
);

export const CopilotNewVsReturnPieChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotNewVsReturnPieChart),
  { ssr: false }
);

export const CopilotTopicBarChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotTopicBarChart),
  { ssr: false }
);

export const CopilotToolBarChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotToolBarChart),
  { ssr: false }
);

export const CopilotToolSuccessRateBarChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotToolSuccessRateBarChart),
  { ssr: false }
);

export const CopilotResponseTimeAreaChartClient = dynamic(
  () => import("./copilot-charts").then((mod) => mod.CopilotResponseTimeAreaChart),
  { ssr: false }
);
