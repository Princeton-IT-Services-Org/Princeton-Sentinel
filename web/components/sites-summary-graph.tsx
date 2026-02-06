"use client";

import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from "chart.js";
import ChartCard from "@/components/chart-card";
import { barColors, commonBarOptions, commonPieOptions, numberLabel, pieColors } from "@/components/chart-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

type Point = { label: string; value: number };

export type SitesSummaryGraphProps = {
  typeBreakdown: Point[];
  createdByMonth: Point[];
};

export function SitesSummaryGraph({ typeBreakdown, createdByMonth }: SitesSummaryGraphProps) {
  const pieLabels = typeBreakdown.map((d) => d.label);
  const pieData = {
    labels: pieLabels,
    datasets: [
      {
        label: "Site types",
        data: typeBreakdown.map((d) => d.value),
        backgroundColor: pieColors(),
        borderColor: pieColors(),
        borderWidth: 1,
      },
    ],
  };

  const pieOptions = {
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

  const createdBarData = {
    labels: createdByMonth.map((p) => p.label),
    datasets: [
      {
        label: "Sites created",
        data: createdByMonth.map((p) => p.value),
        ...barColors("primary"),
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const baseBarOptions: any = commonBarOptions("x");
  const createdBarOptions = {
    ...baseBarOptions,
    plugins: {
      ...baseBarOptions.plugins,
      tooltip: { ...baseBarOptions.plugins?.tooltip, callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${numberLabel(ctx.parsed.y ?? 0)}` } },
    },
    scales: {
      ...baseBarOptions.scales,
      x: {
        ...baseBarOptions.scales?.x,
        ticks: {
          maxRotation: 45,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12,
        },
      },
      y: { ...baseBarOptions.scales?.y, beginAtZero: true, title: { display: true, text: "Sites" } },
    },
  };

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
      <ChartCard title="Site Type Breakdown">
        <Pie data={pieData} options={pieOptions} />
      </ChartCard>
      <ChartCard title="Sites Created Over Time">
        <Bar data={createdBarData} options={createdBarOptions} />
      </ChartCard>
    </div>
  );
}
