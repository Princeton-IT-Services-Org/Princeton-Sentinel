export const PERIODS = [
  { value: "D7", label: "7 days" },
  { value: "D30", label: "30 days" },
  { value: "D90", label: "90 days" },
  { value: "D180", label: "180 days" },
  { value: "ALL", label: "All" },
] as const;

export function normalizePeriod(value: string | null | undefined) {
  return PERIODS.some((period) => period.value === value) ? value! : "D30";
}

export function periodDays(value: string) {
  if (value === "ALL") return null;
  const days = Number(value.replace(/^D/, ""));
  return Number.isFinite(days) ? days : 30;
}

export function toIso(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function formatAppLabel(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  const parts = text.split(".").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || text;
}
