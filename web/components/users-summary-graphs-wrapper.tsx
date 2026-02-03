import dynamic from "next/dynamic";

export const UsersSummaryBarChartClient = dynamic(
  () => import("./users-summary-graphs").then((mod) => mod.UsersSummaryBarChart),
  { ssr: false }
);
