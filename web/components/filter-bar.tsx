import { cn } from "@/lib/utils";

export default function FilterBar({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("ps-toolbar", className)}>{children}</div>;
}

