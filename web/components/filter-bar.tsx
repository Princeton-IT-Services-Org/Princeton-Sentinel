import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type AppliedFilterTag = {
  label: string;
  value: string | number;
};

export default function FilterBar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("ps-toolbar", className)}>{children}</div>;
}

export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs font-medium text-muted-foreground", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function formatSearchFilterValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "All";
}

export function AppliedFilterTags({ tags, className }: { tags: AppliedFilterTag[]; className?: string }) {
  return (
    <div className={cn("flex w-full flex-wrap items-center gap-2 border-t border-border/70 pt-2", className)} aria-label="Applied filters">
      <span className="text-xs font-medium text-muted-foreground">Applied filters</span>
      {tags.map((tag) => (
        <Badge key={tag.label} variant="outline" aria-label={`${tag.label}: ${tag.value}`}>
          {tag.label}: {tag.value}
        </Badge>
      ))}
    </div>
  );
}
