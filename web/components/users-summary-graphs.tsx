"use client";
import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { barColors, commonBarOptions, labelLimit, numberLabel } from "@/components/chart-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function UsersSummaryBarChart({
  data,
  label,
  xTitle,
}: {
  data: { label: string; value: number }[];
  label: string;
  xTitle: string;
}) {
  const barData = {
    labels: data.map((d) => labelLimit(d.label)),
    datasets: [
      {
        label,
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
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: xTitle } },
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
