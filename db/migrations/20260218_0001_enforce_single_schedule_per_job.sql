-- Keep exactly one schedule row per job_id, then enforce uniqueness.
WITH ranked AS (
  SELECT
    schedule_id,
    job_id,
    ROW_NUMBER() OVER (
      PARTITION BY job_id
      ORDER BY enabled DESC, next_run_at ASC NULLS LAST, schedule_id ASC
    ) AS rn
  FROM job_schedules
  WHERE job_id IS NOT NULL
)
DELETE FROM job_schedules js
USING ranked r
WHERE js.schedule_id = r.schedule_id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_schedules_job_id_unique
ON job_schedules (job_id);
