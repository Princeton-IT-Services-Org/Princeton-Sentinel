CREATE TABLE IF NOT EXISTS audit_events (
  event_id uuid PRIMARY KEY,
  occurred_at timestamptz,
  actor_oid text,
  actor_upn text,
  actor_name text,
  action text,
  entity_type text,
  entity_id text,
  details jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
ON audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_action
ON audit_events (action);
