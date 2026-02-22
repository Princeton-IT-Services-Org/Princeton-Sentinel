function normalizeCsvValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function escapeCsvCell(value: unknown): string {
  const normalized = normalizeCsvValue(value);
  const escaped = normalized.replace(/"/g, "\"\"");
  if (/["\n,\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function toCsvRow(values: unknown[]): string {
  return values.map((value) => escapeCsvCell(value)).join(",");
}
