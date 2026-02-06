import type { ChartOptions } from "chart.js";

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function palette() {
  if (isDark()) {
    return {
      text: "#d9e1ee",
      mutedText: "#aab8cd",
      grid: "rgba(170, 184, 205, 0.18)",
      primary: "rgba(107, 153, 232, 0.8)",
      primaryBorder: "rgba(132, 170, 236, 1)",
      danger: "rgba(240, 86, 86, 0.75)",
      dangerBorder: "rgba(240, 86, 86, 1)",
      series: [
        "rgba(107, 153, 232, 0.82)",
        "rgba(70, 115, 191, 0.8)",
        "rgba(95, 186, 140, 0.78)",
        "rgba(220, 95, 120, 0.78)",
        "rgba(170, 128, 225, 0.78)",
        "rgba(130, 172, 238, 0.82)",
      ],
    };
  }

  return {
    text: "#1f2a3d",
    mutedText: "#49566f",
    grid: "rgba(73, 86, 111, 0.15)",
    primary: "rgba(41, 82, 154, 0.74)",
    primaryBorder: "rgba(27, 62, 122, 1)",
    danger: "rgba(210, 75, 75, 0.72)",
    dangerBorder: "rgba(181, 52, 52, 1)",
    series: [
      "rgba(41, 82, 154, 0.74)",
      "rgba(63, 112, 194, 0.74)",
      "rgba(20, 160, 120, 0.72)",
      "rgba(215, 88, 112, 0.72)",
      "rgba(140, 102, 214, 0.72)",
      "rgba(95, 142, 217, 0.74)",
    ],
  };
}

export function labelLimit(value: string, max = 18): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function numberLabel(value: number): string {
  return Number(value || 0).toLocaleString();
}

export function commonBarOptions(indexAxis: "x" | "y" = "x"): ChartOptions<"bar"> {
  const p = palette();
  return {
    responsive: true,
    animation: false,
    transitions: { active: { animation: { duration: 0 } }, show: { animation: { duration: 0 } } },
    plugins: {
      legend: { display: false, labels: { color: p.text } },
      title: { display: false, color: p.text },
      tooltip: {
        enabled: true,
        titleColor: p.text,
        bodyColor: p.text,
        backgroundColor: isDark() ? "rgba(17, 23, 35, 0.95)" : "rgba(255, 255, 255, 0.96)",
        borderColor: p.grid,
        borderWidth: 1,
      },
    },
    indexAxis,
    scales: {
      x: {
        ticks: { color: p.mutedText },
        title: { color: p.mutedText },
        grid: { color: p.grid },
      },
      y: {
        ticks: { color: p.mutedText },
        title: { color: p.mutedText },
        grid: { color: p.grid },
      },
    },
  };
}

export function commonPieOptions(): ChartOptions<"pie"> {
  const p = palette();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    transitions: { active: { animation: { duration: 0 } }, show: { animation: { duration: 0 } } },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: p.mutedText, boxWidth: 12, boxHeight: 12, padding: 10 },
      },
      title: { display: false, color: p.text },
      tooltip: {
        titleColor: p.text,
        bodyColor: p.text,
        backgroundColor: isDark() ? "rgba(17, 23, 35, 0.95)" : "rgba(255, 255, 255, 0.96)",
        borderColor: p.grid,
        borderWidth: 1,
      },
    },
  };
}

export function barColors(kind: "primary" | "danger" = "primary") {
  const p = palette();
  if (kind === "danger") {
    return { backgroundColor: p.danger, borderColor: p.dangerBorder };
  }
  return { backgroundColor: p.primary, borderColor: p.primaryBorder };
}

export function pieColors() {
  return palette().series;
}
