import { requireAdmin } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { deriveJobStatus, formatJobTypeLabel, getJobStatusBadgeClass, getJobStatusLabel } from "@/app/admin/job-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LocalDateTime from "@/components/local-date-time";

export default async function JobsPage() {
  await requireAdmin();

  const rows = await query<any>(
    `
    SELECT j.job_id,
           j.job_type,
           s.schedule_id,
           s.cron_expr,
           s.next_run_at,
           s.enabled AS schedule_enabled,
           m.status AS latest_run_status
    FROM jobs j
    LEFT JOIN job_schedules s ON s.job_id = j.job_id
    LEFT JOIN LATERAL (
      SELECT status
      FROM job_runs r
      WHERE r.job_id = j.job_id
      ORDER BY r.started_at DESC NULLS LAST, r.run_id DESC
      LIMIT 1
    ) m ON true
    ORDER BY j.job_type
    `
  );

  const uniqueJobs = Array.from(new Map(rows.map((row) => [row.job_id, row])).values()).sort((a, b) =>
    (a.job_type || "").localeCompare(b.job_type || "")
  );
  const unscheduledJobs = uniqueJobs.filter((row) => !row.schedule_id);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Job</th>
                <th className="py-2">Job Status</th>
                <th className="py-2">Schedule</th>
                <th className="py-2">Next Run</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = deriveJobStatus({
                  latestRunStatus: row.latest_run_status,
                  scheduleId: row.schedule_id,
                  scheduleEnabled: row.schedule_enabled,
                });
                const hasSchedule = Boolean(row.schedule_id);
                const showPause = hasSchedule && (status === "running" || row.schedule_enabled);
                const showResume = hasSchedule && status !== "running" && !row.schedule_enabled;
                return (
                  <tr key={`${row.job_id}-${row.schedule_id || "none"}`} className="border-t">
                    <td className="py-3 font-semibold text-ink">{formatJobTypeLabel(row.job_type)}</td>
                    <td className="py-3">
                      <span className={getJobStatusBadgeClass(status)}>{getJobStatusLabel(status)}</span>
                    </td>
                    <td className="py-3 text-slate">{row.cron_expr || "--"}</td>
                    <td className="py-3 text-slate">
                      <LocalDateTime value={row.schedule_enabled ? row.next_run_at : null} fallback="-" />
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <form action="/api/worker/run-now" method="post">
                          <input type="hidden" name="job_id" value={row.job_id} />
                          <input type="hidden" name="redirect_to" value="/admin/jobs" />
                          <button
                            className="badge border-primary/35 bg-primary/15 text-foreground disabled:cursor-not-allowed disabled:opacity-70"
                            type="submit"
                            disabled={status === "running"}
                          >
                            {status === "running" ? "Running..." : "Run Now"}
                          </button>
                        </form>
                        {showPause ? (
                          <form action="/api/worker/pause" method="post">
                            <input type="hidden" name="job_id" value={row.job_id} />
                            <input type="hidden" name="redirect_to" value="/admin/jobs" />
                            <button className="badge border border-input bg-background text-foreground" type="submit">
                              Pause Schedule
                            </button>
                          </form>
                        ) : null}
                        {showResume ? (
                          <form action="/api/worker/resume" method="post">
                            <input type="hidden" name="job_id" value={row.job_id} />
                            <input type="hidden" name="redirect_to" value="/admin/jobs" />
                            <button className="badge bg-emerald-100 text-emerald-900" type="submit">
                              Resume Schedule
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!rows.length ? (
                <tr>
                  <td className="py-8 text-center text-muted-foreground" colSpan={5}>
                    No jobs found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="w-full md:col-span-2 md:max-w-2xl md:justify-self-center">
          <CardHeader>
            <CardTitle>Create Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/api/schedules" method="post" className="grid gap-3">
              <input type="hidden" name="action" value="create" />
              <label className="text-sm text-slate">Job</label>
              <select
                name="job_id"
                className="rounded-lg border border-input bg-background p-2"
                disabled={!unscheduledJobs.length}
                required
              >
                {unscheduledJobs.map((row) => (
                  <option key={row.job_id} value={row.job_id}>
                    {formatJobTypeLabel(row.job_type)}
                  </option>
                ))}
              </select>
              {!unscheduledJobs.length ? (
                <div className="text-xs text-slate">All jobs already have a schedule. Pause or resume existing schedules above.</div>
              ) : null}
              <label className="text-sm text-slate">Cron (5-field)</label>
              <input
                name="cron_expr"
                className="rounded-lg border border-input bg-background p-2 font-mono text-sm"
                placeholder="*/15 * * * *"
                required
              />
              <label className="text-sm text-slate">Next run (optional ISO timestamp)</label>
              <input
                name="next_run_at"
                className="rounded-lg border border-input bg-background p-2 text-sm"
                placeholder="2026-02-02T10:00:00Z"
              />
              <button className="badge bg-emerald-100 text-emerald-900" type="submit" disabled={!unscheduledJobs.length}>
                Create Schedule
              </button>
            </form>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
