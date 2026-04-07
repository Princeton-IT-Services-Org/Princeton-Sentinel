import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/info-tooltip";

export function MetricCard({
  label,
  value,
  detail,
  info,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  info?: string;
  className?: string;
}) {
  return (
    <div className={cn("ps-metric-card", className)}>
      <div className="ps-metric-label flex items-center gap-1">
        {label}
        {info ? <InfoTooltip label={info} /> : null}
      </div>
      <div className="ps-metric-value">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

