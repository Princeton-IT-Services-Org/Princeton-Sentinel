import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ps-metric-card", className)}>
      <div className="ps-metric-label">{label}</div>
      <div className="ps-metric-value">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

