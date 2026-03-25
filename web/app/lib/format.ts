type DateLike = string | Date | null | undefined;

function parseDate(value: DateLike): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateValue(
  value: DateLike,
  formatter: (date: Date) => string,
  fallback = "--"
) {
  const date = parseDate(value);
  return date ? formatter(date) : fallback;
}

export function formatDate(value?: DateLike, options?: Intl.DateTimeFormatOptions, fallback = "--") {
  return formatDateValue(value, (date) => date.toLocaleString(undefined, options), fallback);
}

export function formatIsoDate(value?: DateLike, options?: Intl.DateTimeFormatOptions, fallback = "--") {
  return formatDateValue(value, (date) => date.toLocaleDateString(undefined, options), fallback);
}

export function formatIsoDateTime(value?: DateLike, options?: Intl.DateTimeFormatOptions, fallback = "--") {
  return formatDate(value, options, fallback);
}

export function formatDateShort(value?: DateLike, options?: Intl.DateTimeFormatOptions, fallback = "--") {
  return formatIsoDate(value, options, fallback);
}

export function formatBytes(value?: number | string | null) {
  if (value === null || value === undefined) return "--";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "--";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = num;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function formatNumber(value?: number | string | null) {
  if (value === null || value === undefined) return "--";
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "--";
  return num.toLocaleString();
}

export function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
