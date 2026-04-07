-- Append-only event log for agent user block/unblock actions.
-- Every block and unblock adds a new row — does not mutate existing rows.

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
