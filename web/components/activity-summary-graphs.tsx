"use client";
import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function ActivityTopSitesBar({
  topSites,
  windowDays,
}: {
  topSites: { title: string; activeUsers: number }[];
  windowDays: number | null;
}) {
  const barData = {
    labels: topSites.map((s) => (s.title.length > 18 ? s.title.slice(0, 15) + "…" : s.title)),
    datasets: [
      {
        label: `Active users (${windowDays ?? "all"}d)`,
        data: topSites.map((s) => s.activeUsers),
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
      x: { beginAtZero: true, title: { display: true, text: "Users" } },
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
    <Card className="w-full md:w-1/2 max-w-xl flex flex-col items-center justify-center shadow-lg border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle>Top 10 Sites by Active Users</CardTitle>
      </CardHeader>
      <CardContent className="w-full flex items-center justify-center">
        <div className="w-full h-72 flex items-center justify-center">
          <Bar data={barData} options={barOptions} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ActivityTopSitesSharesModsBar({
  topSites,
  windowDays,
}: {
  topSites: { title: string; shares: number; mods: number }[];
  windowDays: number | null;
}) {
  const barData = {
    labels: topSites.map((s) => (s.title.length > 18 ? s.title.slice(0, 15) + "…" : s.title)),
    datasets: [
      {
        label: `Shares+mods (${windowDays ?? "all"}d)`,
        data: topSites.map((s) => s.shares + s.mods),
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
      x: { beginAtZero: true, title: { display: true, text: "Shares+Mods" } },
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
    <Card className="w-full md:w-1/2 max-w-xl flex flex-col items-center justify-center shadow-lg border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle>Top 10 Sites by Shares + Mods</CardTitle>
      </CardHeader>
      <CardContent className="w-full flex items-center justify-center">
        <div className="w-full h-72 flex items-center justify-center">
          <Bar data={barData} options={barOptions} />
        </div>
      </CardContent>
    </Card>
  );
}
