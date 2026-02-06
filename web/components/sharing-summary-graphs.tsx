"use client";
import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from "chart.js";
import { barColors, commonBarOptions, commonPieOptions, labelLimit, numberLabel, pieColors } from "@/components/chart-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

export function SharingSummaryBarChart({
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

export function SharingSummaryPieChart({ data }: { data: { label: string; value: number }[] }) {
  const colors = pieColors();
  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      <div style={{ width: "100%", minWidth: 0 }}>
        <Pie
          data={{
            labels: data.map((d) => d.label),
            datasets: [
              {
                label: "Links",
                data: data.map((d) => d.value),
                backgroundColor: colors,
              },
            ],
          }}
          options={commonPieOptions()}
          height={260}
        />
      </div>
      <style>{`
        .chartjs-render-monitor + div[role="legend"] {
          overflow-x: auto;
          max-width: 100%;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
