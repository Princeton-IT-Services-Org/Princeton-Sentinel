import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";
import { useRouter } from "next/navigation";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function DashboardTotalsBarChart({
  totals,
}: {
  totals: { sites: number; users: number; groups: number; drives: number };
}) {
  const router = useRouter();
  const labels = ["Sites", "Users", "Groups", "Drives"];
  const pageLinks = ["/dashboard/sites", "/dashboard/users", "/dashboard/groups", "/dashboard/sites"];
  const data = {
    labels,
    datasets: [
      {
        label: "Totals",
        data: [totals.sites, totals.users, totals.groups, totals.drives],
        backgroundColor: "rgba(59, 130, 246, 0.7)",
        borderColor: "rgba(59, 130, 246, 1)",
        borderWidth: 1,
        borderRadius: 8,
      },
    ],
  };
  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            if (ctx.parsed.x != null) {
              return `${labels[ctx.dataIndex]}: ${ctx.parsed.x.toLocaleString()}`;
            }
            return "";
          },
        },
      },
    },
    indexAxis: "y" as const,
    onClick: (_event: any, elements: any[]) => {
      if (elements && elements.length > 0) {
        const barIndex = elements[0].index;
        if (pageLinks[barIndex]) {
          router.push(pageLinks[barIndex]);
        }
      }
    },
    scales: {
      x: { beginAtZero: true, title: { display: true, text: "Count" } },
      y: {
        title: { display: false },
        ticks: {
          autoSkip: false,
          callback: function (_value: any, index: number) {
            return labels[index];
          },
        },
      },
    },
  };
  return (
    <div className="w-full h-56 flex items-center justify-center cursor-pointer">
      <Bar data={data} options={options} />
    </div>
  );
}
