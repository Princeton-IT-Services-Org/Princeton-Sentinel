CREATE OR REPLACE FUNCTION notify_feature_state_changed() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'ps_feature_state_changed',
    json_build_object(
      'table_name', TG_TABLE_NAME,
      'operation', TG_OP,
      'changed_at', now()
    )::text
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_notify_feature_flags_state'
      AND tgrelid = 'feature_flags'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_notify_feature_flags_state
      AFTER INSERT OR UPDATE OR DELETE ON feature_flags
      FOR EACH ROW EXECUTE FUNCTION notify_feature_state_changed()
    ';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_notify_active_license_feature_state'
      AND tgrelid = 'active_license_artifact'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_notify_active_license_feature_state
      AFTER INSERT OR UPDATE OR DELETE ON active_license_artifact
      FOR EACH ROW EXECUTE FUNCTION notify_feature_state_changed()
    ';
  END IF;
END;
$$;
