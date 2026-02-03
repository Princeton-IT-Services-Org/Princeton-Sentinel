# DataPosture Dashboard Scripts — Codebase / Replication Guide

This document is a “how this repo works” guide intended for other agents (and humans) to replicate the exact same Graph → MySQL harvesting workflow implemented here.

If you only need the table-by-table schema/field mapping, also read `MYSQL_SCHEMA_DATA_DICTIONARY.md` (it is the most detailed reference for what gets stored in MySQL).

---

## What this repo does (in one sentence)

Uses **Microsoft Graph (app-only / client credentials)** to enumerate **users, groups, group membership, SharePoint sites, drives, drive items (via delta), and item permissions**, and persists the normalized results into **MySQL**.

---

## Quick start (local)

1) Install deps:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2) Copy env file + fill real values:

```bash
cp .env.example .env
```

3) Ensure MySQL is reachable and the user can create schemas/tables.

4) Run the job:

```bash
python run_sync.py sync
```

Notes:
- `run_sync.py` is the job-friendly entrypoint (runs stages, exits non-zero on failure, optionally archives logs).
- `Test.py` is a simple “run everything in order” script, mostly for local experimentation.

---

## Repo layout (what matters)

- `run_sync.py` — CLI entrypoint with stages (`directory`, `groups`, `sites`, `drives`, `items`) + optional `backfill-permissions`.
- `GraphClient.py` — Microsoft Graph client:
  - MSAL client credentials auth (`TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`)
  - GET paging via `@odata.nextLink`
  - retry/backoff for 408/429/5xx
  - drive delta enumeration (`/drives/{id}/root/delta`)
  - permissions enumeration (`/drives/{id}/items/{id}/permissions`)
- `HelperClass.py` — core logic:
  - transforms Graph payloads into normalized DB rows
  - bulk upserts to MySQL (idempotent “latest snapshot” semantics)
  - drive delta checkpointing (`drive_delta_state.deltaLink`)
  - permission flattening into `permissions` + `permission_grants`
- `MySQLConnector.py` — MySQL connection pool + helpers; also bootstraps schema/tables from `sql/ddl/mysql`.
- `sql/ddl/mysql/*.sql` — authoritative MySQL DDL used for auto-bootstrap on first run.
- `MYSQL_SCHEMA_DATA_DICTIONARY.md` — detailed data dictionary for the MySQL schema and mapping from Graph fields → columns.
- `logging_utils.py` — rich console logging + rotating file log at `logs/graph_sync.log`.
- `log_archive.py` — optional post-run upload of `logs/graph_sync.log` to SharePoint/OneDrive via Graph upload session.
- `deploy/aca-job.md` — notes for Azure Container Apps Jobs deployment.
- `Old Setup/` and `Old Setup - Group Test/` — legacy, CSV-oriented crawlers (not part of the current MySQL workflow).

---

## Configuration (environment variables)

The code loads environment variables from a root `.env` file if present (see `.env.example`).

### Required (Graph auth)

- `TENANT_ID` — Entra tenant GUID.
- `CLIENT_ID` — app registration (client) id.
- `CLIENT_SECRET` — app secret value.

Auth flow:
- `GraphClient` uses `msal.ConfidentialClientApplication(...)` and requests the scope `https://graph.microsoft.com/.default`.

### Optional (Graph)

- `GRAPH_BASE` — default `https://graph.microsoft.com/v1.0` (set for national clouds or testing).
- `GRAPH_MAX_RETRIES` — default `5` (retries on 408/429/5xx).
- `GRAPH_CONNECT_TIMEOUT` — default `10` seconds.
- `GRAPH_READ_TIMEOUT` — default `60` seconds.

### Required (MySQL)

- `MYSQL_HOST` — hostname/IP.
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `MYSQL_PORT` — default `3306`.

### Optional (MySQL)

- `MYSQL_SCHEMA` — default `M365-Rawdata`.

On startup, `HelperClass` calls `MySQLConnector.ensure_schema_and_tables(schema)` which:
- creates the schema if missing (`CREATE DATABASE IF NOT EXISTS ...`)
- runs each `sql/ddl/mysql/*.sql` file if the table doesn’t already exist

### Optional (job behavior)

- `FLUSH_EVERY` — default `500` (batch size for DB writes; also used as the CLI default).
- `PULL_PERMISSIONS` — `true|false` (default `true`) to enable/disable permissions fetch during delta sync.

### Optional (logging)

- `LOG_LEVEL` — default `INFO` (console logging; file log captures DEBUG+).

### Optional (log archiving to SharePoint/OneDrive)

Used by `log_archive.py` which runs at the end of `run_sync.py` (in `finally:`).

- `LOG_ARCHIVE_ENABLED` — `true|false` (default `false`).
- `LOG_ARCHIVE_PROVIDER` — currently only `sharepoint|onedrive|graph` are accepted (treated the same; defaults to `sharepoint`).
- Destination (choose one):
  - `LOG_ARCHIVE_DRIVE_ID`
  - OR `LOG_ARCHIVE_SITE_ID`
  - OR `LOG_ARCHIVE_SITE_HOSTNAME` + `LOG_ARCHIVE_SITE_PATH`
- Optional:
  - `LOG_ARCHIVE_FOLDER` — default `DataPostureLogs`
  - `LOG_ARCHIVE_CONFLICT` — `rename|replace|fail` (default `rename`)
  - `LOG_ARCHIVE_FILENAME_PREFIX` — default `graph_sync`

---

## What data is stored (outputs)

### Local filesystem

- `logs/graph_sync.log` — rotating log file (plus backups) written by `logging_utils.py`.

No Graph responses are written to disk by default; the persistent dataset is the MySQL schema described below.

### MySQL schema: `M365-Rawdata` (default)

Tables created/populated by the current workflow:

- `users` — Entra ID user directory profiles (from `GET /users`).
- `account_status` — sign-in/account metadata (from `GET /users?$select=...signInActivity...`).
- `groups` — Entra ID groups (from `GET /groups`).
- `group_members` — direct group→user membership edges (from `GET /groups/{id}/members`).
- `sites` — SharePoint sites discovered tenant-wide (from `GET /sites`).
- `drives` — drives from users/groups/sites (from `GET /users/{id}/drives`, `/groups/{id}/drives`, `/sites/{id}/drives`).
- `drive_delta_state` — per-drive delta checkpoint (`deltaLink`) so subsequent runs are incremental.
- `drive_items` — drive inventory (files/folders) populated via delta (`GET /drives/{id}/root/delta`).
- `permissions` — per-item permission rows, with a **synthetic stable id** (see below).
- `permission_grants` — normalized principals granted by each permission (users/groups/apps/siteGroups + a synthetic “link” principal).

Important storage conventions:

- Many tables store `raw_json` (MySQL `JSON`) containing the original Graph object that produced the row.
- Timestamps from Graph are converted to **naive UTC** `DATETIME` values (`HelperClass.iso_to_mysql_dt()` strips timezone after converting to UTC).
- The schema is “latest snapshot” oriented: most writes are `INSERT ... ON DUPLICATE KEY UPDATE`.

For full, column-by-column mapping (including types, indexes, and field sources), read:
- `MYSQL_SCHEMA_DATA_DICTIONARY.md`
- `sql/ddl/mysql/*.sql`

---

## Microsoft Graph endpoints used (current workflow)

Base URL: `GRAPH_BASE` (default `https://graph.microsoft.com/v1.0`)

Auth: MSAL client credentials token from `https://login.microsoftonline.com/{TENANT_ID}` with scope `https://graph.microsoft.com/.default`.

### Directory + groups + sites + drives

| Purpose | Code path | Method | Endpoint |
|---|---|---:|---|
| Users (directory) | `GraphClient.get_all_users()` | GET | `/users?$top=999` |
| User account status + sign-in activity | `GraphClient.get_all_users_account_status()` | GET | `/users?$select=id,userPrincipalName,accountEnabled,signInActivity,lastPasswordChangeDateTime&$top=999` |
| Groups | `GraphClient.get_all_groups()` | GET | `/groups?$top=999` |
| Group members (users only) | `GraphClient.get_group_members(group_id)` | GET | `/groups/{group_id}/members?$top=999` |
| SharePoint sites | `GraphClient.get_all_sites()` | GET | `/sites?$top=999` |
| User drives | `GraphClient.get_drives_for_user(user_id)` | GET | `/users/{user_id}/drives` |
| Group drives | `GraphClient.get_drives_for_group(group_id)` | GET | `/groups/{group_id}/drives` |
| Site drives (document libraries) | `GraphClient.get_drives_for_site(site_id)` | GET | `/sites/{site_id}/drives` |

Notes:
- Paging is handled via `@odata.nextLink` loops.
- `get_group_members(...)` filters results to user objects by checking `@odata.type`.
- `get_drives_for_user/group/site(...)` treats `403/404/410` as “no drives” and continues.

### Drive inventory (delta)

| Purpose | Code path | Method | Endpoint |
|---|---|---:|---|
| Drive items delta | `GraphClient.get_drive_delta(drive_id, delta_link=...)` | GET | `/drives/{drive_id}/root/delta?$top=200&$select=id,name,parentReference,webUrl,size,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,file,folder,fileSystemInfo,shared,remoteItem,sharepointIds` |

Notes:
- The returned `@odata.deltaLink` is stored in MySQL `drive_delta_state.deltaLink` and reused on the next run.
- Items returned with `@removed` are explicitly deleted from `drive_items` (and cascade to `permissions`/`permission_grants` via FK).

### Permissions

| Purpose | Code path | Method | Endpoint |
|---|---|---:|---|
| Item permissions | `GraphClient.get_item_permissions(drive_id, item_id)` | GET | `/drives/{drive_id}/items/{item_id}/permissions?$select=id,roles,link,inheritedFrom,grantedTo,grantedToV2,grantedToIdentities,grantedToIdentitiesV2` |

Notes:
- Permissions are refreshed for:
  - items changed in the delta feed, and
  - items that already have *direct* permissions recorded (to catch sharing changes that don’t update the driveItem itself).
- `permissions.id` is a stable synthetic id: `{drive_item_id}:{sha1(json(permission))}` (`HelperClass.stable_perm_id()`), not Graph’s `permission.id`.
- `permission_grants` explodes principals from `grantedTo*` identity sets and adds one synthetic principal of type `link` when `permission.link` exists.

### Utility endpoints (log archiving feature)

Used only when `LOG_ARCHIVE_ENABLED=true`:

| Purpose | Code path | Method | Endpoint |
|---|---|---:|---|
| Resolve a site id from hostname+path | `GraphClient.resolve_site_id(...)` | GET | `/sites/{hostname}:{site_path}` |
| Get default drive id for a site | `GraphClient.get_site_default_drive_id(site_id)` | GET | `/sites/{site_id}/drive` |
| Create resumable upload session | `GraphClient.create_upload_session(...)` | POST | `/drives/{drive_id}/root:/{item_path}:/createUploadSession` |
| Upload file chunks | `log_archive._upload_via_upload_session(...)` | PUT | `uploadUrl` (returned by createUploadSession; not `GRAPH_BASE`) |

### Currently implemented but not used by the workflow

- `GraphClient.get_item_list_fields(drive_id, item_id)`:
  - GET `/drives/{drive_id}/items/{item_id}/listItem?$expand=fields`
  - Not called anywhere in the main sync.

---

## Sync stages (what runs, what gets written)

`run_sync.py sync` runs stages in this order by default:

1) `directory`
   - `HelperClass.sync_graph_users_to_mysql()` → `users`
   - `HelperClass.sync_account_status_bulk()` → `account_status`
2) `groups`
   - `HelperClass.sync_graph_groups_to_mysql()` → `groups`
   - `HelperClass.sync_group_members()` → `group_members`
3) `sites`
   - `HelperClass.sync_graph_sites_to_mysql()` → `sites`
4) `drives`
   - `HelperClass.get_all_drives()` → `drives` (user drives)
   - `HelperClass.sync_group_drives_to_mysql()` → `drives` (group drives)
   - `HelperClass.sync_site_drives_to_mysql()` → `drives` (site drives)
5) `items`
   - `HelperClass.sync_all_drive_items()`:
     - `drive_items` upserts + deletes
     - `drive_delta_state` update (store latest `deltaLink`)
     - optional `permissions` + `permission_grants` refresh

---

## Required Graph permissions (practical guidance)

Exact least-privilege varies by tenant and what you choose to crawl, but the current code calls endpoints that typically require:

- Directory enumeration:
  - `Directory.Read.All` (app)
  - `AuditLog.Read.All` (app) — only required for `signInActivity` fields
- SharePoint/OneDrive inventory:
  - `Sites.Read.All` (app)
  - `Files.Read.All` (app)

Optional (only if log archiving is enabled):
- `Sites.ReadWrite.All` (app) **or** `Files.ReadWrite.All` (app) to upload logs to the destination drive/library.

---

## “Exact replication” checklist

To reproduce the same workflow on another machine/tenant:

1) Create an Entra app registration:
   - add a client secret
   - grant the app permissions listed above
   - admin-consent the permissions
2) Prepare MySQL:
   - ensure the user can `CREATE DATABASE` and `CREATE TABLE` (first run auto-bootstraps from `sql/ddl/mysql`)
   - confirm MySQL supports `JSON` columns (MySQL 5.7+; MySQL 8 recommended)
3) Copy the repo + install Python dependencies from `requirements.txt`.
4) Create `.env` based on `.env.example` and fill:
   - `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET`
   - `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_PORT`, `MYSQL_SCHEMA`
5) Run:
   - `python run_sync.py sync` (all stages)
   - optionally: `python run_sync.py backfill-permissions` (slow; calls Graph per item)
6) Verify outputs:
   - `logs/graph_sync.log` exists
   - MySQL schema contains the tables listed above and row counts increase after the run

---

## Legacy scripts (not part of current MySQL workflow)

The `Old Setup/` and `Old Setup - Group Test/` folders contain earlier crawlers that:
- write CSVs instead of MySQL
- call additional endpoints (for example: `POST /drives/{drive_id}/items/{item_id}/extractSensitivityLabels`)

They are retained for reference but are not invoked by `run_sync.py`.

