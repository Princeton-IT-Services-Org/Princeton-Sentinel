-- Combined migration: copilot agent access management + time-bucketed telemetry stats.
-- Supersedes 0014 (access_blocks_reason), 0015 (time_bucketed_stats),
--             0016 (agent_access_revoke_log), 0017 (time_bucketed_agent_filtered_stats).
-- Safe to run on any existing DB — CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout.

-- ── 1. Per-user access blocks ──────────────────────────────────────────────

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

-- Add reason columns if table already existed from a prior migration
ALTER TABLE copilot_access_blocks ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE copilot_access_blocks ADD COLUMN IF NOT EXISTS unblock_reason TEXT;

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

-- ── 4. Agent access block/unblock audit log ────────────────────────────────
-- Append-only event log — every block and unblock adds a new row.

CREATE TABLE IF NOT EXISTS agent_access_revoke_log (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    action          TEXT NOT NULL,          -- 'block' or 'unblock'
    admin_upn       TEXT,                   -- signed-in Sentinel user who performed the action
    admin_name      TEXT,
    bot_id          TEXT NOT NULL,
    bot_name        TEXT,
    user_id         TEXT NOT NULL,
    user_name       TEXT,                   -- display name
    user_email      TEXT,                   -- UPN / email
    reason          TEXT                    -- block_reason or unblock_reason
);

CREATE INDEX IF NOT EXISTS idx_agent_access_revoke_log_occurred
ON agent_access_revoke_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_access_revoke_log_bot
ON agent_access_revoke_log (bot_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_access_revoke_log_user
ON agent_access_revoke_log (user_id, occurred_at DESC);

-- ── 5. Time-bucketed telemetry stats with full filter dimensions ───────────
-- Drops and recreates copilot_response_times, copilot_tool_stats_hourly,
-- and copilot_topic_stats_hourly with (bot_id, channel, is_test, time_bucket).
-- Existing data is dropped — the worker will repopulate on next sync.

DROP TABLE IF EXISTS copilot_tool_stats_hourly;
DROP TABLE IF EXISTS copilot_topic_stats_hourly;
DROP TABLE IF EXISTS copilot_response_times;

CREATE TABLE copilot_response_times (
    bot_id              TEXT        NOT NULL,
    channel             TEXT        NOT NULL DEFAULT '',
    is_test             BOOLEAN     NOT NULL DEFAULT false,
    time_bucket         TIMESTAMPTZ NOT NULL,
    avg_response_sec    NUMERIC(10,2) DEFAULT 0,
    p50_response_sec    NUMERIC(10,2) DEFAULT 0,
    p95_response_sec    NUMERIC(10,2) DEFAULT 0,
    p99_response_sec    NUMERIC(10,2) DEFAULT 0,
    total_responses     INT         DEFAULT 0,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bot_id, channel, is_test, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_copilot_response_times_bucket
ON copilot_response_times (time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_response_times_bot_bucket
ON copilot_response_times (bot_id, time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_response_times_channel
ON copilot_response_times (channel, time_bucket DESC);

CREATE TABLE copilot_tool_stats_hourly (
    tool_name            TEXT        NOT NULL,
    bot_id               TEXT        NOT NULL,
    channel              TEXT        NOT NULL DEFAULT '',
    is_test              BOOLEAN     NOT NULL DEFAULT false,
    time_bucket          TIMESTAMPTZ NOT NULL,
    tool_type            TEXT,
    total_calls          INT         DEFAULT 0,
    successful_calls     INT         DEFAULT 0,
    failed_calls         INT         DEFAULT 0,
    success_rate         NUMERIC(5,2) DEFAULT 0,
    avg_duration_sec     NUMERIC(10,2) DEFAULT 0,
    p50_duration_sec     NUMERIC(10,2) DEFAULT 0,
    p95_duration_sec     NUMERIC(10,2) DEFAULT 0,
    unique_conversations INT         DEFAULT 0,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tool_name, bot_id, channel, is_test, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_copilot_tool_stats_hourly_bucket
ON copilot_tool_stats_hourly (time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_tool_stats_hourly_bot
ON copilot_tool_stats_hourly (bot_id, time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_tool_stats_hourly_channel
ON copilot_tool_stats_hourly (channel, time_bucket DESC);

CREATE TABLE copilot_topic_stats_hourly (
    topic_name           TEXT        NOT NULL,
    bot_id               TEXT        NOT NULL,
    channel              TEXT        NOT NULL DEFAULT '',
    is_test              BOOLEAN     NOT NULL DEFAULT false,
    time_bucket          TIMESTAMPTZ NOT NULL,
    avg_duration_sec     NUMERIC(10,2) DEFAULT 0,
    median_duration_sec  NUMERIC(10,2) DEFAULT 0,
    max_duration_sec     NUMERIC(10,2) DEFAULT 0,
    execution_count      INT         DEFAULT 0,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (topic_name, bot_id, channel, is_test, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_copilot_topic_stats_hourly_bucket
ON copilot_topic_stats_hourly (time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_topic_stats_hourly_bot
ON copilot_topic_stats_hourly (bot_id, time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_topic_stats_hourly_channel
ON copilot_topic_stats_hourly (channel, time_bucket DESC);
