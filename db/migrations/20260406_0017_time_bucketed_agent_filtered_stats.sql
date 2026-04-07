-- Time-bucketed tool, topic, and response time stats with per-agent, per-channel,
-- and test/prod filtering support.
-- Drops and recreates all 3 tables with the full filter dimension set:
--   bot_id, channel, is_test, time_bucket

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
