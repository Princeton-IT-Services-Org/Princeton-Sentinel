import { requireAdmin } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import { formatDate } from "@/app/lib/format";

export default async function JobsPage() {
  await requireAdmin();

  const rows = await query<any>(
    `
    SELECT j.job_id, j.job_type, j.enabled, j.config,
           s.schedule_id, s.cron_expr, s.next_run_at, s.enabled AS schedule_enabled
    FROM jobs j
    LEFT JOIN job_schedules s ON s.job_id = j.job_id
    ORDER BY j.job_type
    `
  );

  const uniqueJobs = Array.from(new Map(rows.map((row) => [row.job_id, row])).values());

  return (
    <div className="grid gap-6">
      <section className="card p-6">
        <h2 className="font-display text-2xl">Jobs</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate/70">
              <tr>
                <th className="py-2">Type</th>
                <th className="py-2">Enabled</th>
                <th className="py-2">Schedule</th>
                <th className="py-2">Next Run</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.job_id}-${row.schedule_id || "none"}`} className="border-t border-white/60">
                  <td className="py-3 font-semibold text-ink">{row.job_type}</td>
                  <td className="py-3">
                    <span className={row.enabled ? "badge badge-ok" : "badge badge-error"}>
                      {row.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-3 text-slate">
                    {row.cron_expr || "--"}
                    {row.schedule_id && (
                      <span className={row.schedule_enabled ? "badge badge-ok ml-2" : "badge badge-error ml-2"}>
                        {row.schedule_enabled ? "Schedule On" : "Schedule Off"}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-slate">{formatDate(row.next_run_at)}</td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-2">
                      <form action="/api/jobs" method="post">
                        <input type="hidden" name="action" value="toggle" />
                        <input type="hidden" name="job_id" value={row.job_id} />
                        <input type="hidden" name="enabled" value={row.enabled ? "false" : "true"} />
                        <button className="badge bg-white/70 text-slate hover:bg-white" type="submit">
                          {row.enabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      {row.schedule_id && (
                        <form action="/api/schedules" method="post">
                          <input type="hidden" name="action" value="toggle" />
                          <input type="hidden" name="schedule_id" value={row.schedule_id} />
                          <input type="hidden" name="enabled" value={row.schedule_enabled ? "false" : "true"} />
                          <button className="badge bg-amber-100 text-amber-900" type="submit">
                            {row.schedule_enabled ? "Pause Schedule" : "Resume Schedule"}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-display text-xl">Create Job</h3>
          <form action="/api/jobs" method="post" className="mt-4 grid gap-3">
            <input type="hidden" name="action" value="create" />
            <label className="text-sm text-slate">Job Type</label>
            <select name="job_type" className="rounded-lg border border-slate/20 bg-white/80 p-2">
              <option value="graph_ingest">graph_ingest</option>
              <option value="refresh_mv">refresh_mv</option>
            </select>
            <label className="text-sm text-slate">Config (JSON)</label>
            <textarea
              name="config"
              rows={4}
              className="rounded-lg border border-slate/20 bg-white/80 p-2 font-mono text-xs"
              placeholder='{"permissions_batch_size": 50, "permissions_stale_after_hours": 24}'
            />
            <button className="badge badge-ok" type="submit">
              Create Job
            </button>
          </form>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-xl">Create Schedule</h3>
          <form action="/api/schedules" method="post" className="mt-4 grid gap-3">
            <input type="hidden" name="action" value="create" />
            <label className="text-sm text-slate">Job</label>
            <select name="job_id" className="rounded-lg border border-slate/20 bg-white/80 p-2">
              {uniqueJobs.map((row) => (
                <option key={row.job_id} value={row.job_id}>
                  {row.job_type}
                </option>
              ))}
            </select>
            <label className="text-sm text-slate">Cron (5-field)</label>
            <input
              name="cron_expr"
              className="rounded-lg border border-slate/20 bg-white/80 p-2 font-mono text-sm"
              placeholder="*/15 * * * *"
            />
            <label className="text-sm text-slate">Next run (optional ISO timestamp)</label>
            <input
              name="next_run_at"
              className="rounded-lg border border-slate/20 bg-white/80 p-2 text-sm"
              placeholder="2026-02-02T10:00:00Z"
            />
            <button className="badge bg-emerald-100 text-emerald-900" type="submit">
              Create Schedule
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
