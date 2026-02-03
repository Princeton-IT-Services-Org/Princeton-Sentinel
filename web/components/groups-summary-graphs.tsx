"use client";

import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export function GroupsSummaryBarChart({ data }: { data: { label: string; value: number }[] }) {
  const barData = {
    labels: data.map((d) => (d.label.length > 18 ? d.label.slice(0, 15) + "…" : d.label)),
    datasets: [
      {
        label: "Top 10 Groups by Members",
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
      x: { beginAtZero: true, title: { display: true, text: "Members" } },
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

export function GroupsSummaryPieChart({ data }: { data: { label: string; value: number }[] }) {
  const pieColors = [
    "rgba(59, 130, 246, 0.7)",
    "rgba(16, 185, 129, 0.7)",
    "rgba(234, 179, 8, 0.7)",
    "rgba(239, 68, 68, 0.7)",
    "rgba(168, 85, 247, 0.7)",
    "rgba(251, 191, 36, 0.7)",
    "rgba(34, 211, 238, 0.7)",
    "rgba(244, 63, 94, 0.7)",
    "rgba(163, 230, 53, 0.7)",
    "rgba(139, 92, 246, 0.7)",
  ];
  return (
    <Pie
      data={{
        labels: data.map((d) => d.label),
        datasets: [
          {
            label: "Groups",
            data: data.map((d) => d.value),
            backgroundColor: pieColors,
          },
        ],
      }}
      options={{
        responsive: true,
        plugins: {
          legend: { position: "bottom" },
          title: { display: false },
        },
      }}
    />
  );
}
