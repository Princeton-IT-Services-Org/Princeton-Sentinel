import { requireAdmin } from "@/app/lib/auth";
import { query } from "@/app/lib/db";
import RunsTable from "@/app/runs/RunsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function RunsPage() {
  await requireAdmin();

  const runs = await query<any>(
    `
    SELECT
      r.run_id,
      r.job_id,
      r.started_at,
      r.finished_at,
      r.status,
      r.error,
      j.job_type,
      l.logged_at AS last_log_at,
      l.level AS last_log_level,
      l.message AS last_log_message
    FROM job_runs r
    LEFT JOIN jobs j ON j.job_id = r.job_id
    LEFT JOIN LATERAL (
      SELECT logged_at, level, message
      FROM job_run_logs
      WHERE run_id = r.run_id
      ORDER BY logged_at DESC, log_id DESC
      LIMIT 1
    ) l ON true
    ORDER BY r.started_at DESC
    LIMIT 200
    `
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Job Runs</CardTitle>
      </CardHeader>
      <CardContent>
        <RunsTable initialRuns={runs} />
      </CardContent>
    </Card>
  );
}
