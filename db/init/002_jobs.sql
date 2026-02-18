CREATE TABLE IF NOT EXISTS jobs (
  job_id uuid PRIMARY KEY,
  job_type text,
  tenant_id text,
  config jsonb,
  enabled boolean
);

CREATE TABLE IF NOT EXISTS job_schedules (
  schedule_id uuid PRIMARY KEY,
  job_id uuid REFERENCES jobs(job_id),
  cron_expr text,
  next_run_at timestamptz,
  enabled boolean
);

CREATE TABLE IF NOT EXISTS job_runs (
  run_id uuid PRIMARY KEY,
  job_id uuid REFERENCES jobs(job_id),
  started_at timestamptz,
  finished_at timestamptz,
  status text,
  error text
);

CREATE TABLE IF NOT EXISTS job_run_logs (
  log_id bigserial PRIMARY KEY,
  run_id uuid REFERENCES job_runs(run_id) ON DELETE CASCADE,
  logged_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL,
  message text NOT NULL,
  context jsonb
);

CREATE INDEX IF NOT EXISTS idx_job_run_logs_run_id_logged_at
ON job_run_logs (run_id, logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_schedules_next_run
ON job_schedules (next_run_at)
WHERE enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_schedules_job_id_unique
ON job_schedules (job_id);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_started
ON job_runs (job_id, started_at DESC);

CREATE TRIGGER trg_touch_job_runs
AFTER INSERT OR UPDATE OR DELETE ON job_runs
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_refresh_mvs_job_runs
AFTER INSERT OR UPDATE OR DELETE ON job_runs
FOR EACH STATEMENT EXECUTE FUNCTION refresh_impacted_mvs();

-- Seed jobs (no default schedules)
INSERT INTO jobs (job_id, job_type, tenant_id, config, enabled)
VALUES
  (gen_random_uuid(), 'graph_ingest', 'default', '{"permissions_batch_size": 50, "permissions_stale_after_hours": 24, "pull_permissions": true, "sync_group_memberships": true, "group_memberships_users_only": true, "flush_every": 500}'::jsonb, true)
ON CONFLICT DO NOTHING;

INSERT INTO jobs (job_id, job_type, tenant_id, config, enabled)
SELECT gen_random_uuid(), 'mv_refresh', 'default', '{"max_views_per_run": 20}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE job_type = 'mv_refresh');

INSERT INTO job_schedules (schedule_id, job_id, cron_expr, next_run_at, enabled)
SELECT gen_random_uuid(), j.job_id, '*/5 * * * *', NULL, true
FROM jobs j
LEFT JOIN job_schedules js ON js.job_id = j.job_id
WHERE j.job_type = 'mv_refresh' AND js.job_id IS NULL;
