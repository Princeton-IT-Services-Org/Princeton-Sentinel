CREATE TABLE IF NOT EXISTS graph_sync_mode_state (
  sync_key text PRIMARY KEY,
  mode text NOT NULL,
  group_id text,
  scope_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mode IN ('full', 'test'))
);

INSERT INTO feature_flags (feature_key, enabled, description)
VALUES ('test_mode', false, 'Scope Graph sync to the configured test group instead of the full tenant.')
ON CONFLICT (feature_key) DO NOTHING;
