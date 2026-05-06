-- Microsoft 365 enterprise Copilot usage reporting and interaction aggregates.
-- Kept separate from copilot_* tables, which are sourced from Copilot Studio App Insights telemetry.

CREATE TABLE IF NOT EXISTS m365_copilot_user_count_summary (
    source_period       TEXT PRIMARY KEY,
    report_refresh_date DATE,
    report_period       INT,
    enabled_users       INT DEFAULT 0,
    active_users        INT DEFAULT 0,
    raw_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_summary_refresh
ON m365_copilot_user_count_summary (report_refresh_date DESC);

CREATE TABLE IF NOT EXISTS m365_copilot_user_count_trend (
    source_period       TEXT NOT NULL,
    report_date         DATE NOT NULL,
    report_period       INT,
    enabled_users       INT DEFAULT 0,
    active_users        INT DEFAULT 0,
    raw_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_period, report_date)
);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_trend_date
ON m365_copilot_user_count_trend (report_date DESC);

CREATE TABLE IF NOT EXISTS m365_copilot_usage_user_detail (
    source_period           TEXT NOT NULL,
    report_user_key         TEXT NOT NULL,
    entra_user_id           TEXT,
    user_principal_name     TEXT,
    display_name            TEXT,
    department              TEXT,
    office_location         TEXT,
    last_activity_date      DATE,
    report_refresh_date     DATE,
    report_period           INT,
    enabled_for_copilot     BOOLEAN,
    active_in_period        BOOLEAN NOT NULL DEFAULT false,
    raw_json                JSONB NOT NULL DEFAULT '{}'::jsonb,
    synced_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (source_period, report_user_key)
);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_user_detail_period_activity
ON m365_copilot_usage_user_detail (source_period, last_activity_date DESC);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_user_detail_entra
ON m365_copilot_usage_user_detail (entra_user_id)
WHERE entra_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS m365_copilot_interaction_aggregates (
    bucket_start_utc    TIMESTAMPTZ NOT NULL,
    entra_user_id       TEXT NOT NULL,
    user_principal_name TEXT NOT NULL DEFAULT '',
    display_name        TEXT NOT NULL DEFAULT '',
    department          TEXT NOT NULL DEFAULT '',
    office_location     TEXT NOT NULL DEFAULT '',
    source_app          TEXT NOT NULL DEFAULT 'Unknown',
    app_class           TEXT NOT NULL DEFAULT '',
    conversation_type   TEXT NOT NULL DEFAULT '',
    context_type        TEXT NOT NULL DEFAULT '',
    locale              TEXT NOT NULL DEFAULT '',
    prompt_count        INT NOT NULL DEFAULT 0,
    request_count       INT NOT NULL DEFAULT 0,
    session_count       INT NOT NULL DEFAULT 0,
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (
        bucket_start_utc,
        entra_user_id,
        source_app,
        app_class,
        conversation_type,
        context_type,
        locale
    )
);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_interactions_bucket
ON m365_copilot_interaction_aggregates (bucket_start_utc DESC);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_interactions_app_bucket
ON m365_copilot_interaction_aggregates (source_app, bucket_start_utc DESC);

CREATE INDEX IF NOT EXISTS idx_m365_copilot_interactions_user_bucket
ON m365_copilot_interaction_aggregates (entra_user_id, bucket_start_utc DESC);

CREATE TABLE IF NOT EXISTS m365_copilot_usage_sync_state (
    state_key                 TEXT PRIMARY KEY,
    last_success_at           TIMESTAMPTZ,
    last_reports_synced_at    TIMESTAMPTZ,
    last_interactions_synced_at TIMESTAMPTZ,
    interaction_window_start  TIMESTAMPTZ,
    interaction_window_end    TIMESTAMPTZ,
    d7_active_users           INT DEFAULT 0,
    resolved_users            INT DEFAULT 0,
    unresolved_users          INT DEFAULT 0,
    prompt_count              INT DEFAULT 0,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_touch_m365_copilot_user_count_summary'
      AND tgrelid = 'm365_copilot_user_count_summary'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_touch_m365_copilot_user_count_summary
      AFTER INSERT OR UPDATE OR DELETE ON m365_copilot_user_count_summary
      FOR EACH ROW EXECUTE FUNCTION touch_table_update_log()
    ';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_touch_m365_copilot_user_count_trend'
      AND tgrelid = 'm365_copilot_user_count_trend'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_touch_m365_copilot_user_count_trend
      AFTER INSERT OR UPDATE OR DELETE ON m365_copilot_user_count_trend
      FOR EACH ROW EXECUTE FUNCTION touch_table_update_log()
    ';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_touch_m365_copilot_usage_user_detail'
      AND tgrelid = 'm365_copilot_usage_user_detail'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_touch_m365_copilot_usage_user_detail
      AFTER INSERT OR UPDATE OR DELETE ON m365_copilot_usage_user_detail
      FOR EACH ROW EXECUTE FUNCTION touch_table_update_log()
    ';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_touch_m365_copilot_interaction_aggregates'
      AND tgrelid = 'm365_copilot_interaction_aggregates'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_touch_m365_copilot_interaction_aggregates
      AFTER INSERT OR UPDATE OR DELETE ON m365_copilot_interaction_aggregates
      FOR EACH ROW EXECUTE FUNCTION touch_table_update_log()
    ';
  END IF;
END;
$$;

INSERT INTO feature_flags (feature_key, enabled, description)
VALUES ('copilot_dashboard', true, 'Enable the Microsoft 365 Copilot usage dashboard.')
ON CONFLICT (feature_key) DO NOTHING;

INSERT INTO jobs (job_id, job_type, tenant_id, config, enabled)
SELECT gen_random_uuid(), 'copilot_usage_sync', 'default', '{"interaction_mode": "all_time", "interaction_lookback_days": 7, "interaction_page_size": 100, "interaction_max_users": 0}'::jsonb, true
WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE job_type = 'copilot_usage_sync');

INSERT INTO job_schedules (schedule_id, job_id, cron_expr, next_run_at, enabled)
SELECT gen_random_uuid(), j.job_id, '0 6 * * *', NULL, true
FROM jobs j
LEFT JOIN job_schedules js ON js.job_id = j.job_id
WHERE j.job_type = 'copilot_usage_sync' AND js.job_id IS NULL;
