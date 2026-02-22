"use client";

import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from "chart.js";
import ChartCard from "@/components/chart-card";
import { barColors, commonBarOptions, commonPieOptions, labelLimit, numberLabel, pieColors } from "@/components/chart-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

type TopSite = { title: string; storageGB: number };
type RiskSummaryBarChartProps = { topSites: TopSite[] };

export function RiskSummaryBarChart({ topSites }: RiskSummaryBarChartProps) {
  const barData = {
    labels: topSites.map((s) => labelLimit(s.title)),
    datasets: [
      {
        data: topSites.map((s) => s.storageGB),
        ...barColors("danger"),
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };
  const baseOptions: any = commonBarOptions("y");
  const barOptions: any = {
    ...baseOptions,
    maintainAspectRatio: false,
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (ctx: any) =>
            `${ctx.dataset.label ?? "Storage"}: ${Number(ctx.parsed.x ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`,
        },
      },
    },
    scales: {
      ...baseOptions.scales,
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Storage (GB)" } },
      y: {
        ...baseOptions.scales?.y,
        ticks: {
          autoSkip: false,
          callback: function (_value: any, index: number) {
            return barData.labels[index];
          },
        },
      },
    },
  };
  return <ChartCard title="Top 10 Flagged Sites by Storage (GB)"><Bar data={barData} options={barOptions} /></ChartCard>;
}

type FlagBreakdown = Record<string, number>;
type RiskSummaryPieChartProps = { flagBreakdown: FlagBreakdown };

export function RiskSummaryPieChart({ flagBreakdown }: RiskSummaryPieChartProps) {
  const pieLabels = Object.keys(flagBreakdown);
  const colors = pieColors();
  const pieData = {
    labels: pieLabels,
    datasets: [
      {
        label: "Flags",
        data: pieLabels.map((k) => flagBreakdown[k]),
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
      },
    ],
  };
  const pieOptions: any = {
    ...commonPieOptions(),
    plugins: {
      ...commonPieOptions().plugins,
      tooltip: {
        ...commonPieOptions().plugins?.tooltip,
        callbacks: {
          label: function (context: any) {
            const label = context.label || "";
            const value = context.parsed || 0;
            return `${label}: ${numberLabel(value)}`;
          },
        },
      },
    },
  };
  return <ChartCard title="Flag Breakdown"><Pie data={pieData} options={pieOptions} /></ChartCard>;
}
