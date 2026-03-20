"use client";
import React from "react";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Filler, Title, Tooltip, Legend
} from "chart.js";
import { barColors, commonBarOptions, commonPieOptions, pieColors, numberLabel } from "@/components/chart-config";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Filler, Title, Tooltip, Legend
);

export function CopilotSessionsBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const barData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Conversations",
        data: data.map((d) => d.value),
        ...barColors("primary"),
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };
  const baseOptions: any = commonBarOptions("x");
  const barOptions = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (ctx: any) => `Conversations: ${numberLabel(ctx.parsed.y ?? 0)}`,
        },
      },
    },
    scales: {
      ...baseOptions.scales,
      y: { ...baseOptions.scales?.y, beginAtZero: true, title: { display: true, text: "Conversations" } },
    },
  };
  return <Bar data={barData} options={barOptions} />;
}

export function CopilotOutcomePieChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const colors = pieColors();
  return (
    <Pie
      data={{
        labels: data.map((d) => d.label),
        datasets: [
          {
            label: "Outcome",
            data: data.map((d) => d.value),
            backgroundColor: colors,
          },
        ],
      }}
      options={commonPieOptions()}
      height={260}
    />
  );
}

export function CopilotEventBreakdownBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const barData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Events",
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
      tooltip: {
        ...baseOptions.plugins?.tooltip,
        callbacks: {
          label: (ctx: any) => `Events: ${numberLabel(ctx.parsed.x ?? 0)}`,
        },
      },
    },
    scales: {
      ...baseOptions.scales,
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Count" } },
    },
  };
  return <Bar data={barData} options={barOptions} />;
}

export function CopilotDailyUsersAreaChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const chartData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Active Users",
        data: data.map((d) => d.value),
        ...barColors("primary"),
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };
  const baseOptions: any = commonBarOptions("x");
  return (
    <Line
      data={chartData}
      options={{
        ...baseOptions,
        scales: {
          ...baseOptions.scales,
          y: { ...baseOptions.scales?.y, beginAtZero: true, title: { display: true, text: "Active Users" } },
        },
      }}
    />
  );
}

export function CopilotNewVsReturnPieChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const colors = pieColors();
  return (
    <Pie
      data={{
        labels: data.map((d) => d.label),
        datasets: [
          {
            label: "Users",
            data: data.map((d) => d.value),
            backgroundColor: colors,
          },
        ],
      }}
      options={commonPieOptions()}
      height={260}
    />
  );
}

export function CopilotTopicBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const barData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Avg Duration (sec)",
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
    scales: {
      ...baseOptions.scales,
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Seconds" } },
    },
  };
  return <Bar data={barData} options={barOptions} />;
}

export function CopilotToolBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const barData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Avg Duration (sec)",
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
    scales: {
      ...baseOptions.scales,
      x: { ...baseOptions.scales?.x, beginAtZero: true, title: { display: true, text: "Seconds" } },
    },
  };
  return <Bar data={barData} options={barOptions} />;
}

export function CopilotToolSuccessRateBarChart({
  data,
}: {
  data: { label: string; success: number; failure: number }[];
}) {
  const barData = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Successful",
        data: data.map((d) => d.success),
        backgroundColor: "rgba(20, 160, 120, 0.72)",
        borderColor: "rgba(16, 128, 96, 1)",
        borderWidth: 1,
        borderRadius: 6,
      },
      {
        label: "Failed",
        data: data.map((d) => d.failure),
        backgroundColor: "rgba(210, 75, 75, 0.72)",
        borderColor: "rgba(181, 52, 52, 1)",
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };
  const baseOptions: any = commonBarOptions("x");
  const barOptions = {
    ...baseOptions,
    plugins: { ...baseOptions.plugins, legend: { display: true, labels: { boxWidth: 12 } } },
    scales: {
      ...baseOptions.scales,
      x: { ...baseOptions.scales?.x, stacked: true },
      y: { ...baseOptions.scales?.y, stacked: true, beginAtZero: true, title: { display: true, text: "Calls" } },
    },
  };
  return <Bar data={barData} options={barOptions} />;
}

export function CopilotResponseTimeAreaChart({
  data,
}: {
  data: { label: string; avg: number; p50: number; p95: number; p99: number }[];
}) {
  const baseOptions: any = commonBarOptions("x");
  return (
    <Line
      data={{
        labels: data.map((d) => d.label),
        datasets: [
          {
            label: "AvgResponseTime",
            data: data.map((d) => d.avg),
            borderColor: "rgba(41, 82, 154, 0.9)",
            backgroundColor: "rgba(41, 82, 154, 0.18)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            order: 1,
          },
          {
            label: "P50ResponseTime",
            data: data.map((d) => d.p50),
            borderColor: "rgba(215, 88, 112, 0.9)",
            backgroundColor: "rgba(215, 88, 112, 0.12)",
            borderWidth: 1.5,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            order: 2,
          },
          {
            label: "P95ResponseTime",
            data: data.map((d) => d.p95),
            borderColor: "rgba(20, 160, 120, 0.9)",
            backgroundColor: "rgba(20, 160, 120, 0.12)",
            borderWidth: 1.5,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            order: 3,
          },
          {
            label: "P99ResponseTime",
            data: data.map((d) => d.p99),
            borderColor: "rgba(140, 102, 214, 0.9)",
            backgroundColor: "rgba(140, 102, 214, 0.10)",
            borderWidth: 1.5,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
            order: 4,
          },
        ],
      }}
      options={{
        ...baseOptions,
        interaction: {
          mode: "index" as const,
          intersect: false,
        },
        plugins: {
          ...baseOptions.plugins,
          legend: {
            display: true,
            position: "bottom" as const,
            labels: { boxWidth: 12, padding: 16 },
          },
          tooltip: {
            ...baseOptions.plugins?.tooltip,
            mode: "index" as const,
            intersect: false,
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}s`,
            },
          },
        },
        scales: {
          ...baseOptions.scales,
          x: {
            ...baseOptions.scales?.x,
            title: { display: true, text: "Time" },
          },
          y: {
            ...baseOptions.scales?.y,
            beginAtZero: true,
            title: { display: true, text: "Response Time (Seconds)" },
          },
        },
      }}
    />
  );
}
