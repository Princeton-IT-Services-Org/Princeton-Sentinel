"use client";

import { useMemo } from "react";

type LocalDateTimeProps = {
  value?: string | null;
  fallback?: string;
};

export default function LocalDateTime({ value, fallback = "--" }: LocalDateTimeProps) {
  const formatted = useMemo(() => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleString();
  }, [value, fallback]);

  return <span>{formatted}</span>;
}
