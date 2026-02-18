export type DerivedJobStatus = "running" | "enabled" | "paused" | "no_schedule";

type StatusInput = {
  latestRunStatus?: string | null;
  scheduleId?: string | null;
  scheduleEnabled?: boolean | null;
};

const statusMeta: Record<DerivedJobStatus, { label: string; className: string }> = {
  running: { label: "Running", className: "badge badge-warn" },
  enabled: { label: "Enabled", className: "badge badge-ok" },
  paused: { label: "Paused", className: "badge badge-error" },
  no_schedule: { label: "No Schedule", className: "badge border border-input bg-background text-foreground" },
};

export function deriveJobStatus(input: StatusInput): DerivedJobStatus {
  if ((input.latestRunStatus || "").toLowerCase() === "running") {
    return "running";
  }
  if (!input.scheduleId) {
    return "no_schedule";
  }
  return input.scheduleEnabled ? "enabled" : "paused";
}

export function getJobStatusLabel(status: DerivedJobStatus): string {
  return statusMeta[status].label;
}

export function getJobStatusBadgeClass(status: DerivedJobStatus): string {
  return statusMeta[status].className;
}

export function formatJobTypeLabel(jobType?: string | null): string {
  if (!jobType) return "Unknown Job";
  if (jobType === "graph_ingest") return "Graph Sync Job";
  return jobType
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
