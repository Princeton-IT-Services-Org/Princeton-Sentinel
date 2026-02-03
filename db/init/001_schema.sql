CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core ingestion tables
CREATE TABLE IF NOT EXISTS msgraph_users (
  id text PRIMARY KEY,
  display_name text,
  user_principal_name text,
  mail text,
  account_enabled boolean,
  user_type text,
  job_title text,
  department text,
  office_location text,
  usage_location text,
  created_dt timestamptz,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb
);

CREATE TABLE IF NOT EXISTS msgraph_groups (
  id text PRIMARY KEY,
  display_name text,
  mail text,
  mail_enabled boolean,
  security_enabled boolean,
  group_types text[],
  visibility text,
  is_assignable_to_role boolean,
  created_dt timestamptz,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb
);

CREATE TABLE IF NOT EXISTS msgraph_sites (
  id text PRIMARY KEY,
  name text,
  web_url text,
  hostname text,
  site_collection_id text,
  created_dt timestamptz,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb
);

CREATE TABLE IF NOT EXISTS msgraph_drives (
  id text PRIMARY KEY,
  site_id text,
  name text,
  drive_type text,
  web_url text,
  owner_id text,
  quota_total bigint,
  quota_used bigint,
  created_dt timestamptz,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb
);

CREATE TABLE IF NOT EXISTS msgraph_drive_items (
  drive_id text NOT NULL,
  id text NOT NULL,
  name text,
  web_url text,
  parent_id text,
  path text,
  is_folder boolean,
  size bigint,
  mime_type text,
  file_hash_sha1 text,
  created_dt timestamptz,
  modified_dt timestamptz,
  created_by_user_id text,
  last_modified_by_user_id text,
  permissions_last_synced_at timestamptz,
  permissions_last_error_at timestamptz,
  permissions_last_error text,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb,
  PRIMARY KEY (drive_id, id)
);

CREATE TABLE IF NOT EXISTS msgraph_drive_item_permissions (
  permission_id text,
  drive_id text NOT NULL,
  item_id text NOT NULL,
  roles text[],
  link_type text,
  link_scope text,
  link_web_url text,
  link_prevents_download boolean,
  link_expiration_dt timestamptz,
  inherited_from_id text,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb,
  PRIMARY KEY (drive_id, item_id, permission_id)
);

CREATE TABLE IF NOT EXISTS msgraph_drive_item_permission_grants (
  permission_id text,
  drive_id text NOT NULL,
  item_id text NOT NULL,
  principal_type text,
  principal_id text,
  principal_display_name text,
  principal_email text,
  principal_user_principal_name text,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb,
  PRIMARY KEY (drive_id, item_id, permission_id, principal_type, principal_id)
);

CREATE TABLE IF NOT EXISTS msgraph_group_memberships (
  group_id text NOT NULL,
  member_id text NOT NULL,
  member_type text NOT NULL,
  synced_at timestamptz,
  deleted_at timestamptz,
  raw_json jsonb,
  PRIMARY KEY (group_id, member_id, member_type)
);

CREATE TABLE IF NOT EXISTS msgraph_delta_state (
  resource_type text,
  partition_key text,
  delta_link text,
  last_synced_at timestamptz,
  PRIMARY KEY (resource_type, partition_key)
);

-- Update tracking
CREATE TABLE IF NOT EXISTS table_update_log (
  table_name text PRIMARY KEY,
  last_updated_at timestamptz
);

CREATE OR REPLACE FUNCTION touch_table_update_log() RETURNS trigger AS $$
BEGIN
  INSERT INTO table_update_log (table_name, last_updated_at)
  VALUES (TG_TABLE_NAME, now())
  ON CONFLICT (table_name)
  DO UPDATE SET last_updated_at = EXCLUDED.last_updated_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_users
AFTER INSERT OR UPDATE OR DELETE ON msgraph_users
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_groups
AFTER INSERT OR UPDATE OR DELETE ON msgraph_groups
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_sites
AFTER INSERT OR UPDATE OR DELETE ON msgraph_sites
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_drives
AFTER INSERT OR UPDATE OR DELETE ON msgraph_drives
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_drive_items
AFTER INSERT OR UPDATE OR DELETE ON msgraph_drive_items
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_item_permissions
AFTER INSERT OR UPDATE OR DELETE ON msgraph_drive_item_permissions
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_item_permission_grants
AFTER INSERT OR UPDATE OR DELETE ON msgraph_drive_item_permission_grants
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

CREATE TRIGGER trg_touch_group_memberships
AFTER INSERT OR UPDATE OR DELETE ON msgraph_group_memberships
FOR EACH ROW EXECUTE FUNCTION touch_table_update_log();

-- MV dependency metadata
CREATE TABLE IF NOT EXISTS mv_dependencies (
  mv_name text,
  table_name text
);

CREATE TABLE IF NOT EXISTS mv_refresh_log (
  mv_name text PRIMARY KEY,
  last_refreshed_at timestamptz
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_drive_items_drive_id ON msgraph_drive_items (drive_id);
CREATE INDEX IF NOT EXISTS idx_drive_item_permissions_item_id ON msgraph_drive_item_permissions (drive_id, item_id);
CREATE INDEX IF NOT EXISTS idx_drive_item_permission_grants_item_id ON msgraph_drive_item_permission_grants (drive_id, item_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_group_id ON msgraph_group_memberships (group_id);
