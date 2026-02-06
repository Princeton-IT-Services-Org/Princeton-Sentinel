"use client";
import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import ChartCard from "@/components/chart-card";
import { barColors, commonBarOptions, labelLimit, numberLabel } from "@/components/chart-config";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function ActivityTopSitesBar({
  topSites,
  windowDays,
}: {
  topSites: { title: string; activeUsers: number }[];
  windowDays: number | null;
}) {
  const barData = {
    labels: topSites.map((s) => labelLimit(s.title)),
    datasets: [
      {
        label: `Active users (${windowDays ?? "all"}d)`,
        data: topSites.map((s) => s.activeUsers),
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
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Users" } },
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
  return <ChartCard title="Top 10 Sites by Active Users"><Bar data={barData} options={barOptions} /></ChartCard>;
}

export function ActivityTopSitesSharesModsBar({
  topSites,
  windowDays,
}: {
  topSites: { title: string; shares: number; mods: number }[];
  windowDays: number | null;
}) {
  const barData = {
    labels: topSites.map((s) => labelLimit(s.title)),
    datasets: [
      {
        label: `Shares+mods (${windowDays ?? "all"}d)`,
        data: topSites.map((s) => s.shares + s.mods),
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
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Shares+Mods" } },
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
  return <ChartCard title="Top 10 Sites by Shares + Mods"><Bar data={barData} options={barOptions} /></ChartCard>;
}
