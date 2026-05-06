"use client";

import React from "react";
import { Bar, Line, Pie } from "react-chartjs-2";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

import { barColors, commonBarOptions, commonPieOptions, numberLabel, pieColors } from "@/components/chart-config";
import { formatDate, formatIsoDate } from "@/app/lib/format";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Filler, Title, Tooltip, Legend);

const DAY_PARTS = [
  { label: "Early morning", range: "5:00-8:59 AM", start: 5, endExclusive: 9 },
  { label: "Morning", range: "9:00-11:59 AM", start: 9, endExclusive: 12 },
  { label: "Afternoon", range: "12:00-4:59 PM", start: 12, endExclusive: 17 },
  { label: "Evening", range: "5:00-8:59 PM", start: 17, endExclusive: 21 },
  { label: "Night", range: "9:00 PM-4:59 AM", start: 21, endExclusive: 5 },
];

function getDayPartLabel(value: string) {
  const hour = new Date(value).getHours();
  if (!Number.isFinite(hour)) return "Unknown";
  const part = DAY_PARTS.find(({ start, endExclusive }) =>
    start < endExclusive ? hour >= start && hour < endExclusive : hour >= start || hour < endExclusive
  );
  return part?.label ?? "Unknown";
}

export function M365CopilotTrendChart({
  data,
}: {
  data: { date: string; activeUsers: number; enabledUsers: number }[];
}) {
  const baseOptions: any = commonBarOptions("x");
  return (
    <Line
      data={{
        labels: data.map((d) => formatIsoDate(d.date, { month: "short", day: "numeric" })),
        datasets: [
          {
            label: "Active users",
            data: data.map((d) => d.activeUsers),
            borderColor: "rgba(41, 82, 154, 1)",
            backgroundColor: "rgba(41, 82, 154, 0.18)",
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
          {
            label: "Enabled users",
            data: data.map((d) => d.enabledUsers),
            borderColor: "rgba(20, 160, 120, 1)",
            backgroundColor: "rgba(20, 160, 120, 0.10)",
            fill: false,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      }}
      options={{
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: { display: true, position: "bottom" as const, labels: { boxWidth: 12 } },
          tooltip: {
            ...baseOptions.plugins?.tooltip,
            mode: "index" as const,
            intersect: false,
          },
        },
        interaction: { mode: "index" as const, intersect: false },
        scales: {
          ...baseOptions.scales,
          y: { ...baseOptions.scales?.y, beginAtZero: true, title: { display: true, text: "Users" } },
        },
      }}
    />
  );
}

export function M365CopilotAppPieChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <Pie
      data={{
        labels: data.map((d) => d.label),
        datasets: [{ label: "Prompts", data: data.map((d) => d.value), backgroundColor: pieColors() }],
      }}
      options={commonPieOptions()}
      height={260}
    />
  );
}

export function M365CopilotTimeOfDayChart({
  data,
}: {
  data: { bucket: string; prompts: number }[];
}) {
  const dayPartData = React.useMemo(() => {
    const totals = new Map(DAY_PARTS.map((part) => [part.label, 0]));
    for (const row of data) {
      const label = getDayPartLabel(row.bucket);
      totals.set(label, (totals.get(label) || 0) + Number(row.prompts || 0));
    }
    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((row) => row.value > 0);
  }, [data]);
  const baseOptions: any = commonPieOptions();
  return (
    <Pie
      data={{
        labels: dayPartData.map((d) => d.label),
        datasets: [{ label: "Prompts", data: dayPartData.map((d) => d.value), backgroundColor: pieColors() }],
      }}
      options={{
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            ...baseOptions.plugins?.tooltip,
            callbacks: {
              label: (ctx: any) => {
                const part = DAY_PARTS.find((item) => item.label === ctx.label);
                const range = part ? ` (${part.range})` : "";
                return `${ctx.label}${range}: ${numberLabel(ctx.parsed ?? 0)} prompts`;
              },
            },
          },
        },
      }}
      height={260}
    />
  );
}

export function M365CopilotAppTimeChart({
  buckets,
  apps,
}: {
  buckets: { bucket: string; values: Record<string, number> }[];
  apps: string[];
}) {
  const baseOptions: any = commonBarOptions("x");
  const colors = pieColors();
  return (
    <Bar
      data={{
        labels: buckets.map((d) => formatDate(d.bucket, { month: "short", day: "numeric" })),
        datasets: apps.map((app, index) => ({
          label: app,
          data: buckets.map((d) => d.values[app] ?? 0),
          backgroundColor: colors[index % colors.length],
          borderColor: colors[index % colors.length],
          borderWidth: 1,
          borderRadius: 4,
        })),
      }}
      options={{
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: { display: true, position: "bottom" as const, labels: { boxWidth: 12 } },
          tooltip: {
            ...baseOptions.plugins?.tooltip,
            mode: "index" as const,
            intersect: false,
            callbacks: {
              title: (items: any[]) => {
                const idx = items[0]?.dataIndex ?? 0;
                return formatDate(buckets[idx]?.bucket, { weekday: "short", month: "short", day: "numeric" });
              },
            },
          },
        },
        scales: {
          ...baseOptions.scales,
          x: { ...baseOptions.scales?.x, stacked: true },
          y: { ...baseOptions.scales?.y, stacked: true, beginAtZero: true, title: { display: true, text: "Prompts" } },
        },
      }}
    />
  );
}
