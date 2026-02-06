import { cn } from "@/lib/utils";

export default function MetricGrid({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("ps-metric-grid", className)}>{children}</div>;
}

