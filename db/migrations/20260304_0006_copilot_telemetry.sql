-- Copilot Studio agent telemetry tables (sourced from Application Insights)
-- Events: BotMessageReceived, BotMessageSend, TopicStart, TopicEnd, OnErrorLog
-- Agent ID: cloud_RoleInstance | Filter: cloud_RoleName == "Microsoft Copilot Studio"

-- Sessions / conversations
CREATE TABLE IF NOT EXISTS copilot_sessions (
    session_id      TEXT PRIMARY KEY,       -- conversationId
    bot_id          TEXT,                   -- cloud_RoleInstance (agent identifier)
    bot_name        TEXT,                   -- agent display name
    channel         TEXT,                   -- channelId
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    outcome         TEXT,                   -- resolved / escalated / abandoned
    turn_count      INT DEFAULT 0,
    user_id         TEXT,                   -- App Insights user_Id
    is_test         BOOLEAN DEFAULT false,  -- designMode == "True"
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_started
ON copilot_sessions (started_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_bot
ON copilot_sessions (bot_id, started_at DESC)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_copilot_sessions_user
ON copilot_sessions (user_id)
WHERE deleted_at IS NULL AND user_id IS NOT NULL;

-- Raw events
CREATE TABLE IF NOT EXISTS copilot_events (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      TEXT REFERENCES copilot_sessions(session_id),
    event_name      TEXT NOT NULL,          -- BotMessageReceived, BotMessageSend, TopicStart, TopicEnd, OnErrorLog
    event_ts        TIMESTAMPTZ NOT NULL,
    properties      JSONB DEFAULT '{}'::jsonb,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_copilot_events_dedup UNIQUE (session_id, event_name, event_ts)
);

CREATE INDEX IF NOT EXISTS idx_copilot_events_session
ON copilot_events (session_id, event_ts);

CREATE INDEX IF NOT EXISTS idx_copilot_events_name_ts
ON copilot_events (event_name, event_ts DESC);

-- Error log (OnErrorLog events)
CREATE TABLE IF NOT EXISTS copilot_errors (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id      TEXT,
    agent_name      TEXT,
    channel         TEXT,
    error_code      TEXT,
    error_message   TEXT,
    error_ts        TIMESTAMPTZ NOT NULL,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_copilot_errors_dedup UNIQUE (session_id, error_code, error_ts)
);

CREATE INDEX IF NOT EXISTS idx_copilot_errors_ts
ON copilot_errors (error_ts DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_errors_code
ON copilot_errors (error_code, error_ts DESC);

-- Topic performance stats (TopicStart/TopicEnd pair durations)
CREATE TABLE IF NOT EXISTS copilot_topic_stats (
    topic_name          TEXT PRIMARY KEY,
    avg_duration_sec    NUMERIC(10,2) DEFAULT 0,
    median_duration_sec NUMERIC(10,2) DEFAULT 0,
    max_duration_sec    NUMERIC(10,2) DEFAULT 0,
    execution_count     INT DEFAULT 0,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tool/connector performance stats (from dependencies table)
CREATE TABLE IF NOT EXISTS copilot_tool_stats (
    tool_name            TEXT PRIMARY KEY,
    tool_type            TEXT,
    total_calls          INT DEFAULT 0,
    successful_calls     INT DEFAULT 0,
    failed_calls         INT DEFAULT 0,
    success_rate         NUMERIC(5,2) DEFAULT 0,
    avg_duration_sec     NUMERIC(10,2) DEFAULT 0,
    p50_duration_sec     NUMERIC(10,2) DEFAULT 0,
    p95_duration_sec     NUMERIC(10,2) DEFAULT 0,
    unique_conversations INT DEFAULT 0,
    synced_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agent response time (BotMessageReceived → BotMessageSend pair latency, hourly buckets)
CREATE TABLE IF NOT EXISTS copilot_response_times (
    time_bucket         TIMESTAMPTZ PRIMARY KEY,
    avg_response_sec    NUMERIC(10,2) DEFAULT 0,
    p50_response_sec    NUMERIC(10,2) DEFAULT 0,
    p95_response_sec    NUMERIC(10,2) DEFAULT 0,
    p99_response_sec    NUMERIC(10,2) DEFAULT 0,
    total_responses     INT DEFAULT 0,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_response_times_bucket
ON copilot_response_times (time_bucket DESC);

-- Summary materialized view for dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_copilot_summary AS
SELECT
    date_trunc('day', started_at)::date AS day,
    bot_id,
    bot_name,
    COUNT(*)::int                                              AS total_sessions,
    COALESCE(AVG(turn_count), 0)::numeric(6,1)                AS avg_turns,
    COUNT(*) FILTER (WHERE outcome = 'resolved')::int          AS resolved,
    COUNT(*) FILTER (WHERE outcome = 'escalated')::int         AS escalated,
    COUNT(*) FILTER (WHERE outcome = 'abandoned')::int         AS abandoned,
    COUNT(DISTINCT user_id)::int                               AS unique_users,
    COUNT(*) FILTER (WHERE is_test = true)::int                AS test_sessions,
    MIN(started_at)                                            AS earliest_session,
    MAX(started_at)                                            AS latest_session
FROM copilot_sessions
WHERE deleted_at IS NULL
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX IF NOT EXISTS mv_copilot_summary_uidx
ON mv_copilot_summary (day, bot_id);

-- Register MV dependency for auto-refresh
INSERT INTO mv_dependencies (mv_name, table_name) VALUES
    ('mv_copilot_summary', 'copilot_sessions')
ON CONFLICT DO NOTHING;

-- Mark MV as dirty so it refreshes on next cycle
INSERT INTO mv_refresh_queue (mv_name, dirty_since)
VALUES ('mv_copilot_summary', now())
ON CONFLICT (mv_name) DO NOTHING;

-- Seed the copilot_telemetry job + 15-minute schedule
INSERT INTO jobs (job_id, job_type, tenant_id, config, enabled)
SELECT gen_random_uuid(), 'copilot_telemetry', 'default', '{"lookback_hours": 24}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE job_type = 'copilot_telemetry');

INSERT INTO job_schedules (schedule_id, job_id, cron_expr, next_run_at, enabled)
SELECT gen_random_uuid(), j.job_id, '*/15 * * * *', NULL, true
FROM jobs j
LEFT JOIN job_schedules js ON js.job_id = j.job_id
WHERE j.job_type = 'copilot_telemetry' AND js.job_id IS NULL;
