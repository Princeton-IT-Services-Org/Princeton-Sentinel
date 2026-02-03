"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Jobs", href: "/admin/jobs" },
  { label: "Runs", href: "/admin/runs" },
  { label: "Admin", href: "/admin" },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || (tab.href !== "/admin" && pathname.startsWith(tab.href));
        return (
          <Link
            key={tab.href}
            className={
              isActive
                ? "badge bg-ink text-white"
                : "badge bg-white/70 text-slate hover:bg-white"
            }
            href={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
