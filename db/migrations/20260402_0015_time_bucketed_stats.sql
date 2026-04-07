-- Add bot_id to copilot_response_times so response time can be filtered per agent.
-- Recreates the table with a composite PK (bot_id, time_bucket).
-- Existing global data is dropped — the worker will repopulate on next sync.

DROP TABLE IF EXISTS copilot_response_times;

CREATE TABLE copilot_response_times (
    bot_id              TEXT NOT NULL,
    time_bucket         TIMESTAMPTZ NOT NULL,
    avg_response_sec    NUMERIC(10,2) DEFAULT 0,
    p50_response_sec    NUMERIC(10,2) DEFAULT 0,
    p95_response_sec    NUMERIC(10,2) DEFAULT 0,
    p99_response_sec    NUMERIC(10,2) DEFAULT 0,
    total_responses     INT DEFAULT 0,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bot_id, time_bucket)
);

CREATE INDEX IF NOT EXISTS idx_copilot_response_times_bucket
ON copilot_response_times (time_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_response_times_bot_bucket
ON copilot_response_times (bot_id, time_bucket DESC);
