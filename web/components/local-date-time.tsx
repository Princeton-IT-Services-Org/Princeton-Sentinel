"use client";

import { useMemo } from "react";
import { formatIsoDateTime } from "@/app/lib/format";

type LocalDateTimeProps = {
  value?: string | null;
  fallback?: string;
};

export default function LocalDateTime({ value, fallback = "--" }: LocalDateTimeProps) {
  const formatted = useMemo(() => formatIsoDateTime(value, undefined, fallback), [value, fallback]);

  return <span>{formatted}</span>;
}
