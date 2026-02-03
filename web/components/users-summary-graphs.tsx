"use client";
import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";

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
    labels: data.map((d) => (d.label.length > 18 ? d.label.slice(0, 15) + "…" : d.label)),
    datasets: [
      {
        label,
        data: data.map((d) => d.value),
        backgroundColor: "rgba(59, 130, 246, 0.7)",
        borderColor: "rgba(59, 130, 246, 1)",
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };
  const barOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.x ?? 0}` } },
    },
    indexAxis: "y" as const,
    scales: {
      x: { beginAtZero: true, title: { display: true, text: xTitle } },
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
  return <Bar data={barData} options={barOptions} />;
}
