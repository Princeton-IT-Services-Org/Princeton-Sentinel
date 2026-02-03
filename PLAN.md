# Princeton Sentinel – Project Plan

This repository will contain a self-contained, Docker Compose–driven stack with three containers:

- **Postgres (16)**: persistent state + ingestion tables + scheduling metadata + materialized views
- **Web (Next.js)**: UI + API that *declares intent* (jobs/schedules) and triggers *run-now* via worker API
- **Worker (Python/Flask)**: control plane API + scheduler loop + job executors (**Microsoft Graph API ingest** + MV refresh)

Project name (everywhere): **Princeton Sentinel**

Key constraint: **no system cron**; **web never executes jobs**; **worker enforces schedules**, polling Postgres.

---

## 1) Target Repository Layout

Per your preference, the runnable stack will live at the **repo root**:

```
├── docker-compose.yml
├── .env.example
├── README.md
│
├── db/
│   └── init/
│       ├── 001_schema.sql
│       ├── 002_jobs.sql
│       ├── 003_materialized_views.sql
│       └── 004_audit.sql
│
├── web/
│   ├── Dockerfile
│   ├── next.config.js
│   └── app/
│       ├── layout.tsx
│       ├── page.tsx
│       ├── jobs/page.tsx
│       ├── runs/page.tsx
│       ├── analytics/page.tsx
│       ├── admin/page.tsx
│       └── api/
│           ├── jobs/route.ts
│           ├── schedules/route.ts
│           ├── runs/route.ts
│           └── analytics/route.ts
│
└── worker/
    ├── Dockerfile
    ├── requirements.txt
    └── app/
        ├── main.py
        ├── api.py
        ├── auth.py
        ├── db.py
        ├── scheduler.py
        └── jobs/
            ├── graph_ingest.py
            └── refresh_mv.py
```

Notes:
- `jobs/graph_ingest.py` will implement **Microsoft Graph API ingestion** (not an in-memory “graph data structure” model).
- Single-tenant: `tenant_id` can be stored as a constant (e.g., `default`) to keep the schema future-compatible without exposing tenant selection in the UI.
- Target Microsoft cloud: **Commercial** (`graph.microsoft.com`).
- Initial ingestion scope: **users, groups, sites, drives, drive_items**.
- Ingest **all** sites and drives, perform a full drive item inventory, and store **permissions for all files** (plus live drill-down verification endpoints).

---

## 2) Docker Compose Plan

### Services
- `postgres`
  - Image: `postgres:16`
  - Volume: named volume for database data
  - Init SQL mounted from `./db/init` into `/docker-entrypoint-initdb.d`
  - Exposes `5432` to host for local debugging
- `web`
  - Build: `./web`
  - Runs Next.js app (UI + API routes)
  - Exposes `3000` to host
  - Connects to Postgres via `DATABASE_URL`
  - Calls worker control plane via `WORKER_API_URL` (internal service DNS)
  - Uses the **shared Entra app registration** for:
    - user login (OIDC)
    - app-only Graph calls (real-time drill-down server routes)
- `worker`
  - Build: `./worker`
  - Runs Flask API + scheduler loop in the same container (no cron)
  - Internal-only (no host port); reachable from `web` via Compose service DNS
  - Uses `DATABASE_URL` to Postgres
  - Poll interval controlled by env `SCHEDULER_POLL_SECONDS`
  - Uses the **shared Entra app registration** for app-only Microsoft Graph ingestion (client secret)

### Shared environment
Single `.env` file (with `.env.example` committed), referenced via `env_file:` in Compose.

### Resource sizing
Compose will include “best-effort” resource hints for the worker (higher CPU/memory). Docker Compose only enforces `deploy.resources` in swarm mode; we’ll document this and keep web lightweight by design.

---

## 3) Authentication Plan (Entra / Microsoft Identity Platform)

Goal: Entra authentication for (a) **dashboard user sign-in**, and (b) **web → worker API** calls, with auditability of who changed what.

### Web (Next.js)
- Use Entra for interactive user login (OIDC auth code flow).
- Store user identity in the session and require auth for all pages and API routes.
- When writing changes to `jobs` / `job_schedules`, write an `audit_events` row capturing the actor.

### Worker API (Flask)
- Protect worker endpoints with Entra-issued JWT bearer tokens (validate issuer + signature + audience).
- Web calls worker endpoints with a bearer token; worker logs `requested_by` into `audit_events`.
- Plan: web calls worker with a **delegated user access token** for the Worker API so the worker can derive the actor identity directly from JWT claims.

### Microsoft Graph API (web + worker)
- Target: **Commercial** Microsoft Graph using **v1.0 endpoints only** (`https://graph.microsoft.com/v1.0`).
- All Graph calls are **application permissions** (client credentials).
- Web and worker use the **same** Entra app registration (`client_id`/`client_secret`) for app-only Graph calls.
- Graph tokens are never exposed to the browser; Graph calls are server-side only (Next.js server routes; worker jobs).
- User identity is used for audit attribution only (who triggered which operation), not for Graph authorization.

---

## 4) Database Plan (Postgres 16)

### Extensions / conventions
- Use `timestamptz` for all timestamps (UTC by default)
- Enable `pgcrypto` (UUID generation) if needed
- UI displays timestamps in the user’s local timezone (browser locale), while DB remains UTC.

### Core scheduling tables (from spec)
Create exactly these tables (names/columns preserved):
- `jobs(job_id uuid pk, job_type text, tenant_id text, config jsonb, enabled boolean)`
- `job_schedules(schedule_id uuid pk, job_id uuid fk, cron_expr text, next_run_at timestamptz, enabled boolean)`
- `job_runs(run_id uuid pk, job_id uuid, started_at timestamptz, finished_at timestamptz, status text, error text)`

Recommended additions (minimal, but improves correctness/UX):
- Foreign key `job_runs.job_id -> jobs.job_id`
- Indexes:
  - `job_schedules(next_run_at) WHERE enabled`
  - `job_runs(job_id, started_at desc)`
- Optional: `job_runs.triggered_by text` (e.g., `schedule` vs `run_now`) if you want that visibility

### Ingestion tables
Microsoft Graph API ingestion storage (typed tables, **latest-state + soft-deletes**, flattened columns + `raw`):

General rules:
- Upsert by Graph `id`
- Keep `raw jsonb` (latest representation) for debugging
- Use `deleted_at timestamptz` for soft deletes (set when Graph returns `@removed`; clear if object reappears)
- Prefer `synced_at timestamptz` (when we last fetched/upserted this row) vs “created/updated” timestamps from Graph objects

Initial resource tables (expandable):
- `msgraph_users(id text pk, display_name text, user_principal_name text, mail text, account_enabled boolean, user_type text, job_title text, department text, office_location text, usage_location text, created_dt timestamptz, synced_at timestamptz, deleted_at timestamptz, raw jsonb)`
- `msgraph_groups(id text pk, display_name text, mail text, mail_enabled boolean, security_enabled boolean, group_types text[], visibility text, is_assignable_to_role boolean, created_dt timestamptz, synced_at timestamptz, deleted_at timestamptz, raw jsonb)`
- `msgraph_sites(id text pk, name text, web_url text, hostname text, site_collection_id text, created_dt timestamptz, synced_at timestamptz, deleted_at timestamptz, raw jsonb)`
- `msgraph_drives(id text pk, site_id text, name text, drive_type text, web_url text, owner_id text, quota_total bigint, quota_used bigint, created_dt timestamptz, synced_at timestamptz, deleted_at timestamptz, raw jsonb)`
- Note: `msgraph_drives.site_id` is nullable for OneDrive drives (personal drives), while SharePoint drives attach to a site.
- `msgraph_drive_items(id text pk, drive_id text, name text, web_url text, parent_id text, path text, is_folder boolean, size bigint, mime_type text, file_hash_sha1 text, created_dt timestamptz, modified_dt timestamptz, created_by_user_id text, last_modified_by_user_id text, permissions_last_synced_at timestamptz, synced_at timestamptz, deleted_at timestamptz, raw jsonb)`

Permissions ingestion (worker bulk, for **all files**):
- `msgraph_drive_item_permissions(permission_id text, drive_id text, item_id text, roles text[], link_type text, link_scope text, link_web_url text, link_prevents_download boolean, link_expiration_dt timestamptz, inherited_from_id text, synced_at timestamptz, deleted_at timestamptz, raw jsonb, primary key(permission_id, item_id))`
- `msgraph_drive_item_permission_grants(permission_id text, item_id text, principal_type text, principal_id text, principal_display_name text, principal_email text, principal_user_principal_name text, synced_at timestamptz, deleted_at timestamptz, raw jsonb, primary key(permission_id, item_id, principal_type, principal_id))`

Delta link state (required; “delta wherever possible”):
- `msgraph_delta_state(resource_type text, partition_key text, delta_link text, last_synced_at timestamptz, primary key(resource_type, partition_key))`
  - Examples:
    - `resource_type='users', partition_key='global'`
    - `resource_type='groups', partition_key='global'`
    - `resource_type='drive_items', partition_key='<drive_id>'`

Retention policy:
- Latest-state only: upsert per `id`, keep only the latest `raw`.
- Soft-deletes: when Graph returns `@removed`, set `deleted_at` instead of hard-delete; include deleted items in dashboard.

Hybrid note (initial cut):
- Store inventory + metadata + **full permissions** for drive items via worker ingestion.
- Still provide live Graph drill-down endpoints for verification and to fetch details not stored/flattened.

### Table update tracking (from spec)
- `table_update_log(table_name text pk, last_updated_at timestamptz)`

Implementation choice:
- Add a small SQL trigger function `touch_table_update_log()` and attach it to base tables that should mark updates (at least the ingestion tables, and any future processed tables).

### Materialized views plan
Goal: views used for dashboard aggregates, refreshable with:
`REFRESH MATERIALIZED VIEW CONCURRENTLY <mv>`

We will create at least:
- `mv_msgraph_inventory_summary` (counts, including soft-deleted, and last sync timestamps for users/groups/sites/drives/drive_items)
- `mv_msgraph_sharing_posture_summary` (aggregates derived from stored permissions: link scope/type, externally shared counts, anonymous link counts, etc.)
- `mv_latest_job_runs` (latest status per job)

Each MV will have a **unique index** to satisfy concurrent refresh requirements.

### “Impacted MV only” refresh strategy
To refresh only impacted MVs after ingest, we’ll track MV dependencies + refresh timestamps:
- `mv_dependencies(mv_name text, table_name text)` (declares what base tables each MV depends on)
- `mv_refresh_log(mv_name text pk, last_refreshed_at timestamptz)`

Worker refresh job algorithm:
1. Find tables updated since last refresh for each MV via `table_update_log` + `mv_refresh_log`
2. Refresh only those MVs where any dependency is newer than the MV’s last refresh
3. Update `mv_refresh_log` for refreshed MVs

### System audit table (required)
Create:
- `audit_events(event_id uuid pk, occurred_at timestamptz, actor_oid text, actor_upn text, actor_name text, action text, entity_type text, entity_id text, details jsonb)`

---

## 5) Worker Plan (Python + Flask)

### Components
- `app/api.py`: Flask app + routes
- `app/scheduler.py`: polling loop that enforces schedules
- `app/jobs/graph_ingest.py`: Microsoft Graph API ingestion executor (initially minimal but functional)
- `app/jobs/refresh_mv.py`: MV refresh executor (concurrent refresh)
- `app/db.py`: Postgres connection helpers (psycopg2)
- `app/main.py`: process entrypoint that starts Flask + scheduler together

### Control plane API (from spec)
- `GET /health`: returns `ok`, db connectivity, scheduler loop status
- `GET /jobs/status`: returns jobs + schedules + last run summary (from tables/MVs)
- `POST /jobs/run-now`: marks a job runnable immediately (sets `next_run_at = now()` or inserts a “run now” run request)
- `POST /jobs/pause`: sets `jobs.enabled = false` (and/or schedule enabled false)
- `POST /jobs/resume`: sets enabled true

### Scheduler loop (critical behavior)
Runs every `SCHEDULER_POLL_SECONDS`:
1. Query for the next due schedule: `job_schedules.enabled AND jobs.enabled AND next_run_at <= now()`
2. Use row lock to avoid double-pick: `FOR UPDATE SKIP LOCKED LIMIT 1`
3. Acquire **Postgres advisory lock per job** (required by spec) before executing
4. Insert `job_runs` row with `status='running'` and `started_at=now()`
5. Execute the job by `job_type`:
   - `graph_ingest`: pull Microsoft Graph API data and upsert into typed ingestion tables (+ touch update log)
   - `refresh_mv`: refresh impacted MVs
6. Update `job_runs` with `success|failed`, `finished_at`, and error text
7. Compute and persist `next_run_at` from a standard 5-field cron expression (**minute resolution, no seconds**) for the schedule row

### Graph ingest job (high-level algorithm)
Order matters because later resources depend on earlier ones:
1. Users delta → upsert `msgraph_users`
2. Groups delta → upsert `msgraph_groups`
3. Sites inventory (v1.0 only; search + paging) → upsert `msgraph_sites`
4. Drives per site → upsert `msgraph_drives` (SharePoint)
5. Drives per user → upsert `msgraph_drives` (OneDrive/personal drives)
6. Drive items delta per drive (full inventory on first run) → upsert `msgraph_drive_items`
7. For every file item, fetch permissions → upsert `msgraph_drive_item_permissions` + `msgraph_drive_item_permission_grants`
8. Handle `@removed` by **soft-deleting** corresponding rows (set `deleted_at`)
9. Persist delta links in `msgraph_delta_state`

We’ll keep per-resource “partitions” small (notably drive items by drive) to avoid one giant delta cursor.

Scale note:
- Drive item permissions have no delta API; we will scan permissions in **batches** (configurable per run), track `permissions_last_synced_at`, and resume across runs until coverage is complete.

### Job locking choice
We’ll use:
- `FOR UPDATE SKIP LOCKED` on the schedule row (prevents multiple workers picking same schedule)
- `pg_try_advisory_lock(...)` keyed by `job_id` (enforces single-job execution across schedules/workers)

---

## 6) Web Plan (Next.js UI + API)

### Responsibilities (per spec)
- Manage `jobs` and `job_schedules` (CRUD + enable/disable)
- Provide dashboard views backed by Postgres queries/materialized views
- Trigger “run now” via worker HTTP API (not direct execution)

### UI pages (minimal but usable)
- `/jobs`: list/create/edit jobs (job_type, enabled, config JSON) (single-tenant; tenant_id hidden/defaulted)
- `/jobs` (same page or modal): manage schedule (cron_expr, enabled)
- `/runs`: recent job_runs, filters by job
- `/analytics`: display aggregates from MVs (Graph API–derived posture metrics + job health)
- `/admin`: worker health/status + “run now” controls (worker is internal-only)

### Web API routes
Server-side API endpoints to:
- read/write `jobs`, `job_schedules`, `job_runs`
- proxy “run now / pause / resume” calls to worker (`WORKER_API_URL`)
  - these admin endpoints write `audit_events` entries using the signed-in Entra user identity

### Real-time Graph endpoints (server-side only)
Keep minimal and focused for drill-down:
- `GET /api/graph/drive-item-permissions?driveId=&itemId=`
- `GET /api/graph/drive-item-sharing?driveId=&itemId=`

(These use the app-only Graph token; responses are not persisted.)

### DB access approach
Keep it lightweight:
- Use `pg` (node-postgres) directly from Next.js server routes/server components
- No ORM required for MVP (unless you strongly prefer Prisma/Drizzle)

### Styling
- Tailwind CSS for dashboard UI.

---

## 7) Seed Data / First-Run Experience

To make the stack demonstrably “alive” after `docker compose up`:
- Seed a couple jobs:
  - `graph_ingest` job (Microsoft Graph API ingest)
  - `refresh_mv` job (or automatically run after ingest)
- Seed a schedule (e.g., every 5 minutes) with `next_run_at` set shortly after startup

This should populate tables and make `/analytics` show non-empty results quickly.

---

## 8) Development Workflow (planned)

Local run:
- `docker compose up --build`
- Visit web on `http://localhost:3000`
- Worker health via `/admin` (worker is internal-only)

Common checks (later, during implementation):
- Validate SQL init runs cleanly from a fresh volume
- Confirm scheduler enforces `next_run_at` and locks properly
- Confirm `REFRESH MATERIALIZED VIEW CONCURRENTLY` succeeds (unique indexes present)

---

## 9) Open Questions (Microsoft Graph + Entra)

### Recorded decisions
- Graph endpoints: commercial tenant, v1.0 only, delta where available
- Scope: all sites + all drives (SharePoint + OneDrive), full drive item inventory, permissions for all files stored + live verification endpoints
- Entra apps: a single shared Entra app registration for both web and worker
- Deletes: soft-delete and surface in dashboard

### Remaining inputs for implementation
1. **Entra configuration values**: tenant ID, client ID/secret, redirect URIs, and (if used) Worker API scope/role identifiers.
2. **Operational limits**: any constraints for initial implementation (max concurrency/QPS, acceptable “first full scan” duration, schedule frequency).
