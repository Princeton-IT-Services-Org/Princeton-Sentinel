"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

const TIMEZONES = [
  { label: "Browser local", value: "" },
  { label: "UTC", value: "UTC" },
  { label: "GMT (London)", value: "Europe/London" },
  { label: "CET (Paris)", value: "Europe/Paris" },
  { label: "IST (Kolkata)", value: "Asia/Kolkata" },
  { label: "SGT (Singapore)", value: "Asia/Singapore" },
  { label: "AEST (Sydney)", value: "Australia/Sydney" },
  { label: "EST (New York)", value: "America/New_York" },
  { label: "CST (Chicago)", value: "America/Chicago" },
  { label: "PST (Los Angeles)", value: "America/Los_Angeles" },
];

const TIMESTAMP_KEYS = new Set(["cr6c3_lastseeninsync", "modifiedon"]);

const COLUMNS: { key: string; label: string }[] = [
  { key: "cr6c3_agentname", label: "Agent Name" },
  { key: "cr6c3_username", label: "User Name" },
  { key: "cr6c3_disableflagcopilot", label: "Disable Flag" },
  { key: "cr6c3_copilotflagchangereason", label: "Flag Change Reason" },
  { key: "cr6c3_lastseeninsync", label: "Last Seen In Sync" },
  { key: "modifiedon", label: "Modified On" },
];

function formatTimestamp(raw: string, tz: string): string {
  try {
    const date = new Date(raw);
    if (isNaN(date.getTime())) return raw;
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz || undefined,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return raw;
  }
}

export default function DataverseTablePage() {
  const [rows, setRows] = React.useState<Record<string, any>[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [timezone, setTimezone] = React.useState("");

  React.useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/agents/dataverse");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Failed to load (${res.status})`);
          return;
        }
        const data = await res.json();
        setRows(data.rows || []);
      } catch {
        setError("Failed to fetch Dataverse data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const effectiveTz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agent-User Information</h1>
          <p className="text-sm text-muted-foreground">
            Live data from Dataverse — agent access assignments
          </p>
        </div>
        <Link href="/dashboard/agents">
          <Button variant="outline" size="sm">
            ← Back to Agents
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>
              Agent Access Records
              {!loading && !error && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({rows.length} row{rows.length !== 1 ? "s" : ""})
                </span>
              )}
            </CardTitle>
            <CardDescription>All agent-user assignments from Dataverse</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs text-foreground"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}{tz.value === "" ? ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : ""}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows found.</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    {COLUMNS.map((col) => (
                      <TableHead key={col.key} className="whitespace-nowrap">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      {COLUMNS.map((col) => {
                        const val = row[col.key];
                        const isDisableFlag = col.key === "cr6c3_disableflagcopilot";
                        const isTimestamp = TIMESTAMP_KEYS.has(col.key);
                        const isTrue = isDisableFlag && val === true;
                        const display = val == null
                          ? "—"
                          : isTrue
                          ? <span className="font-medium text-red-500">true</span>
                          : isTimestamp
                          ? formatTimestamp(String(val), effectiveTz)
                          : String(val);
                        return (
                          <TableCell key={col.key} className="max-w-xs truncate" title={val == null ? "" : String(val)}>
                            {display}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
