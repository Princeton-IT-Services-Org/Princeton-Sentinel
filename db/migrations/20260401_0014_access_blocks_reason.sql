-- Combined migration: copilot_access_blocks + copilot_agent_registrations + reason columns.
-- Supersedes 0010 (table creation) and 0011 (agent registrations patch).
-- Safe to run on any existing DB — all statements are idempotent.

-- ── 1. Per-user access blocks ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot_access_blocks (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             TEXT NOT NULL,
    user_display_name   TEXT,
    user_principal_name TEXT,
    bot_id              TEXT NOT NULL,
    bot_name            TEXT,
    block_scope         TEXT NOT NULL DEFAULT 'agent',
    entra_policy_id     TEXT,
    entra_sync_status   TEXT NOT NULL DEFAULT 'not_applicable',
    entra_sync_error    TEXT,
    blocked_by          TEXT NOT NULL,
    blocked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    unblocked_at        TIMESTAMPTZ,
    unblocked_by        TEXT,
    block_reason        TEXT,
    unblock_reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_copilot_access_blocks_active
ON copilot_access_blocks (bot_id, user_id)
WHERE unblocked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_access_blocks_user_active
ON copilot_access_blocks (user_id)
WHERE unblocked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_copilot_access_blocks_active
ON copilot_access_blocks (user_id, bot_id)
WHERE unblocked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_access_blocks_policy
ON copilot_access_blocks (entra_policy_id)
WHERE entra_policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_access_blocks_audit
ON copilot_access_blocks (blocked_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_touch_copilot_access_blocks'
      AND tgrelid = 'copilot_access_blocks'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_touch_copilot_access_blocks
      AFTER INSERT OR UPDATE OR DELETE ON copilot_access_blocks
      FOR EACH ROW EXECUTE FUNCTION touch_table_update_log()
    ';
  END IF;
END;
$$;

-- Add reason columns if table already existed from 0010
ALTER TABLE copilot_access_blocks ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE copilot_access_blocks ADD COLUMN IF NOT EXISTS unblock_reason TEXT;

-- ── 2. Agent registration mapping ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS copilot_agent_registrations (
    bot_id              TEXT PRIMARY KEY,
    bot_name            TEXT,
    app_registration_id TEXT NOT NULL,
    app_object_id       TEXT,
    disabled_at         TIMESTAMPTZ,
    disabled_by         TEXT,
    disabled_reason     TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_agent_registrations_disabled
ON copilot_agent_registrations (bot_id)
WHERE disabled_at IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_touch_copilot_agent_registrations'
      AND tgrelid = 'copilot_agent_registrations'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_touch_copilot_agent_registrations
      AFTER INSERT OR UPDATE OR DELETE ON copilot_agent_registrations
      FOR EACH ROW EXECUTE FUNCTION touch_table_update_log()
    ';
  END IF;
END;
$$;

-- ── 3. copilot_sessions: user display name from App Insights fromName ─────
ALTER TABLE copilot_sessions ADD COLUMN IF NOT EXISTS user_name TEXT;
