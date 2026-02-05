"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

const tabs = [
  { label: "Analytics", href: "/admin/analytics" },
  { label: "Jobs", href: "/admin/jobs" },
  { label: "Runs", href: "/admin/runs" },
  { label: "Admin", href: "/admin" },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || (tab.href !== "/admin" && pathname.startsWith(tab.href));
        return (
          <Button key={tab.href} asChild size="sm" variant={isActive ? "default" : "outline"}>
            <Link href={tab.href}>{tab.label}</Link>
          </Button>
        );
      })}
    </div>
  );
}
