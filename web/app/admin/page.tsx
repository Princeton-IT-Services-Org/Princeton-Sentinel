import { requireAdmin } from "@/app/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LocalDateTime from "@/components/local-date-time";

async function fetchWorker(path: string) {
  const base = process.env.WORKER_API_URL;
  if (!base) throw new Error("WORKER_API_URL not set");
  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Worker error ${res.status}: ${text}`);
  }
  return res.json();
}

export default async function AdminPage() {
  await requireAdmin();

  let health: any = null;
  let status: any = null;
  let error: string | null = null;

  try {
    health = await fetchWorker("/health");
    status = await fetchWorker("/jobs/status");
  } catch (err: any) {
    error = err?.message || "Failed to reach worker";
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Worker Status</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="badge badge-error">{error}</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-sm text-slate">Health</div>
                <div className="text-lg font-semibold text-ink">{health?.ok ? "OK" : "Degraded"}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-sm text-slate">DB</div>
                <div className="text-lg font-semibold text-ink">{health?.db ? "Connected" : "Down"}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="text-sm text-slate">Last ping</div>
                <div className="text-xs text-slate">
                  <LocalDateTime value={health?.heartbeat?.last_success_at} fallback="Never" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run Controls</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Job</th>
                <th className="py-2">Enabled</th>
                <th className="py-2">Schedule</th>
                <th className="py-2">Next Run</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(status?.jobs || []).map((row: any) => (
                <tr key={`${row.job_id}-${row.schedule_id || "none"}`} className="border-t border-white/60">
                  <td className="py-3 font-semibold text-ink">{row.job_type}</td>
                  <td className="py-3">
                    <span className={row.enabled ? "badge badge-ok" : "badge badge-error"}>
                      {row.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-3 text-slate">{row.cron_expr || "--"}</td>
                  <td className="py-3 text-slate">
                    <LocalDateTime value={row.next_run_at} />
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <form action="/api/worker/run-now" method="post">
                        <input type="hidden" name="job_id" value={row.job_id} />
                        <button className="badge border-primary/35 bg-primary/15 text-foreground" type="submit">
                          Run Now
                        </button>
                      </form>
                      <form action="/api/worker/pause" method="post">
                        <input type="hidden" name="job_id" value={row.job_id} />
                        <button className="badge border border-input bg-background text-foreground" type="submit">
                          Disable
                        </button>
                      </form>
                      <form action="/api/worker/resume" method="post">
                        <input type="hidden" name="job_id" value={row.job_id} />
                        <button className="badge bg-emerald-100 text-emerald-900" type="submit">
                          Enable
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
