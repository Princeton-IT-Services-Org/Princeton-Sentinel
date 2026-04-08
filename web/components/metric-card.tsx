import Link from "next/link";

import { cn } from "@/lib/utils";
import { InfoTooltip } from "@/components/info-tooltip";

export function MetricCard({
  label,
  value,
  detail,
  info,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  info?: string;
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <div className="ps-metric-label flex items-center gap-1">
        {label}
        {info ? <InfoTooltip label={info} /> : null}
      </div>
      <div className="ps-metric-value">{value}</div>
      {detail ? <div className="mt-1 text-xs text-muted-foreground">{detail}</div> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "ps-metric-card block cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          className
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn("ps-metric-card", className)}>
      {content}
    </div>
  );
}
