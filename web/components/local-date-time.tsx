"use client";

import { useMemo } from "react";
import { formatIsoDateTime } from "@/app/lib/format";

type LocalDateTimeProps = {
  value?: string | null;
  options?: Intl.DateTimeFormatOptions;
  dateOnly?: boolean;
  fallback?: string;
};

function formatLocalDateOnly(value?: string | null, options?: Intl.DateTimeFormatOptions, fallback = "--") {
  if (!value) return fallback;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(undefined, options);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString(undefined, options);
}

export default function LocalDateTime({ value, options, dateOnly = false, fallback = "--" }: LocalDateTimeProps) {
  const formatted = useMemo(
    () => (dateOnly ? formatLocalDateOnly(value, options, fallback) : formatIsoDateTime(value, options, fallback)),
    [value, options, dateOnly, fallback]
  );

  return <span>{formatted}</span>;
}
