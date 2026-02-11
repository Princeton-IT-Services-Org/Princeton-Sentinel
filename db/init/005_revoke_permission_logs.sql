CREATE TABLE IF NOT EXISTS revoke_permission_logs (
  log_id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_oid text,
  actor_upn text,
  actor_name text,
  drive_id text,
  item_id text,
  permission_id text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failed')),
  failure_reason text,
  warning text,
  source text NOT NULL DEFAULT 'dashboard_file_drilldown',
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_revoke_logs_occurred_at
ON revoke_permission_logs (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_revoke_logs_outcome_occurred
ON revoke_permission_logs (outcome, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_revoke_logs_actor_occurred
ON revoke_permission_logs (actor_upn, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_revoke_logs_item_occurred
ON revoke_permission_logs (drive_id, item_id, occurred_at DESC);
