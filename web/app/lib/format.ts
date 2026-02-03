export function formatDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

export function formatIsoDate(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString();
}

export function formatIsoDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

export function formatDateShort(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString();
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
