import { query } from "@/app/lib/db";

export type RunRow = {
  run_id: string;
  job_id: string;
  job_type?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  status: string;
  error?: string | null;
  last_log_at?: string | null;
  last_log_level?: string | null;
  last_log_message?: string | null;
};

export async function getLatestRunsByType(): Promise<RunRow[]> {
  return query<RunRow>(
    `
    WITH latest_by_type AS (
      SELECT DISTINCT ON (j.job_type)
        r.run_id,
        r.job_id,
        r.started_at,
        r.finished_at,
        r.status,
        r.error,
        j.job_type
      FROM job_runs r
      LEFT JOIN jobs j ON j.job_id = r.job_id
      ORDER BY j.job_type NULLS LAST, r.started_at DESC NULLS LAST, r.run_id DESC
    )
    SELECT
      x.run_id,
      x.job_id,
      x.started_at,
      x.finished_at,
      x.status,
      x.error,
      x.job_type,
      l.logged_at AS last_log_at,
      l.level AS last_log_level,
      l.message AS last_log_message
    FROM latest_by_type x
    LEFT JOIN LATERAL (
      SELECT logged_at, level, message
      FROM job_run_logs
      WHERE run_id = x.run_id
      ORDER BY logged_at DESC, log_id DESC
      LIMIT 1
    ) l ON true
    ORDER BY x.started_at DESC NULLS LAST, x.run_id DESC
    `
  );
}

export async function getRunsByTypePage(
  jobType: string,
  page: number,
  pageSize: number
): Promise<{ runs: RunRow[]; total: number }> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 100;
  const offset = (safePage - 1) * safePageSize;

  const [countRows, rows] = await Promise.all([
    query<{ total: number }>(
      `
      SELECT COUNT(*)::int AS total
      FROM job_runs r
      JOIN jobs j ON j.job_id = r.job_id
      WHERE j.job_type = $1
      `,
      [jobType]
    ),
    query<RunRow>(
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
      JOIN jobs j ON j.job_id = r.job_id
      LEFT JOIN LATERAL (
        SELECT logged_at, level, message
        FROM job_run_logs
        WHERE run_id = r.run_id
        ORDER BY logged_at DESC, log_id DESC
        LIMIT 1
      ) l ON true
      WHERE j.job_type = $1
      ORDER BY r.started_at DESC NULLS LAST, r.run_id DESC
      LIMIT $2 OFFSET $3
      `,
      [jobType, safePageSize, offset]
    ),
  ]);

  return { runs: rows, total: countRows[0]?.total || 0 };
}
