"use client";

import React from "react";
import { Bar, Pie } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from "chart.js";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        backgroundColor: [
          "rgba(59, 130, 246, 0.7)",
          "rgba(16, 185, 129, 0.7)",
          "rgba(234, 179, 8, 0.7)",
          "rgba(239, 68, 68, 0.7)",
          "rgba(168, 85, 247, 0.7)",
        ],
        borderColor: [
          "rgba(59, 130, 246, 1)",
          "rgba(16, 185, 129, 1)",
          "rgba(234, 179, 8, 1)",
          "rgba(239, 68, 68, 1)",
          "rgba(168, 85, 247, 1)",
        ],
        borderWidth: 1,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    plugins: {
      legend: { position: "bottom" as const },
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

  const createdBarData = {
    labels: createdByMonth.map((p) => p.label),
    datasets: [
      {
        label: "Sites created",
        data: createdByMonth.map((p) => p.value),
        backgroundColor: "rgba(99, 102, 241, 0.6)",
        borderColor: "rgba(99, 102, 241, 1)",
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const createdBarOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y ?? 0}` } },
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: 12,
        },
      },
      y: { beginAtZero: true, title: { display: true, text: "Sites" } },
    },
  };

  return (
    <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-2">
      <Card className="w-full border border-gray-200 bg-white shadow-lg">
        <CardHeader>
          <CardTitle>Site Type Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <Pie data={pieData} options={pieOptions} />
          </div>
        </CardContent>
      </Card>

      <Card className="w-full border border-gray-200 bg-white shadow-lg">
        <CardHeader>
          <CardTitle>Sites Created Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <Bar data={createdBarData} options={createdBarOptions} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
