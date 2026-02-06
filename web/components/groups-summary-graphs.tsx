"use client";

import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from "chart.js";
import { barColors, commonBarOptions, commonPieOptions, labelLimit, numberLabel, pieColors } from "@/components/chart-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export function GroupsSummaryBarChart({ data }: { data: { label: string; value: number }[] }) {
  const barData = {
    labels: data.map((d) => labelLimit(d.label)),
    datasets: [
      {
        label: "Top 10 Groups by Members",
        data: data.map((d) => d.value),
        ...barColors("primary"),
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };
  const baseOptions: any = commonBarOptions("y");
  const barOptions = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      tooltip: { ...baseOptions.plugins?.tooltip, callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${numberLabel(ctx.parsed.x ?? 0)}` } },
    },
    scales: {
      ...baseOptions.scales,
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Members" } },
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
  return <Bar data={barData} options={barOptions} />;
}

export function GroupsSummaryPieChart({ data }: { data: { label: string; value: number }[] }) {
  const colors = pieColors();
  return (
    <Pie
      data={{
        labels: data.map((d) => d.label),
        datasets: [
          {
            label: "Groups",
            data: data.map((d) => d.value),
            backgroundColor: colors,
          },
        ],
      }}
      options={commonPieOptions()}
    />
  );
}
