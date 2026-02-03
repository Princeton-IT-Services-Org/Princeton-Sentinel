import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from "chart.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

type TopSite = { title: string; storageGB: number };
type RiskSummaryBarChartProps = { topSites: TopSite[] };

export function RiskSummaryBarChart({ topSites }: RiskSummaryBarChartProps) {
  const barData = {
    labels: topSites.map((s) => (s.title.length > 18 ? s.title.slice(0, 15) + "…" : s.title)),
    datasets: [
      {
        data: topSites.map((s) => s.storageGB),
        backgroundColor: "rgba(239, 68, 68, 0.7)",
        borderColor: "rgba(239, 68, 68, 1)",
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };
  const barOptions: import("chart.js").ChartOptions<"bar"> = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label ?? "Storage"}: ${ctx.parsed.x?.toFixed(2) ?? 0} GB` } },
    },
    indexAxis: "y",
    scales: {
      x: { beginAtZero: true, title: { display: true, text: "Storage (GB)" } },
      y: {
        title: { display: false },
        ticks: {
          autoSkip: false,
          callback: function (_value: any, index: number) {
            return barData.labels[index];
          },
        },
      },
    },
  };
  return (
    <Card className="w-full max-w-xl flex flex-col items-center justify-center shadow-lg border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle>Top 10 Flagged Sites by Storage (GB)</CardTitle>
      </CardHeader>
      <CardContent className="w-full flex items-center justify-center">
        <div className="w-full h-72 flex items-center justify-center">
          <Bar data={barData} options={barOptions} />
        </div>
      </CardContent>
    </Card>
  );
}

type FlagBreakdown = Record<string, number>;
type RiskSummaryPieChartProps = { flagBreakdown: FlagBreakdown };

export function RiskSummaryPieChart({ flagBreakdown }: RiskSummaryPieChartProps) {
  const pieLabels = Object.keys(flagBreakdown);
  const pieData = {
    labels: pieLabels,
    datasets: [
      {
        label: "Flags",
        data: pieLabels.map((k) => flagBreakdown[k]),
        backgroundColor: [
          "rgba(239, 68, 68, 0.7)",
          "rgba(234, 179, 8, 0.7)",
          "rgba(59, 130, 246, 0.7)",
          "rgba(16, 185, 129, 0.7)",
          "rgba(168, 85, 247, 0.7)",
        ],
        borderColor: [
          "rgba(239, 68, 68, 1)",
          "rgba(234, 179, 8, 1)",
          "rgba(59, 130, 246, 1)",
          "rgba(16, 185, 129, 1)",
          "rgba(168, 85, 247, 1)",
        ],
        borderWidth: 1,
      },
    ],
  };
  const pieOptions: import("chart.js").ChartOptions<"pie"> = {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 20 },
      },
      title: { display: false },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const label = context.label || "";
            const value = context.parsed || 0;
            return `${label}: ${value}`;
          },
        },
      },
    },
  };
  return (
    <Card className="w-full max-w-xl flex flex-col items-center justify-center shadow-lg border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle>Flag Breakdown</CardTitle>
      </CardHeader>
      <CardContent className="w-full flex items-center justify-center">
        <div className="w-full h-72 flex items-center justify-center overflow-x-auto">
          <Pie data={pieData} options={pieOptions} />
        </div>
      </CardContent>
    </Card>
  );
}
