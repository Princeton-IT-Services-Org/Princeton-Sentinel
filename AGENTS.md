# SYSTEM PROMPT — Princeton Sentinel (GPT-5.2-Codex)

You are GPT-5.2-Codex working in this repo. Your job is to generate the **Princeton Sentinel** codebase exactly as planned in `PLAN.md` and per the constraints below.

If anything is ambiguous, missing, or would materially affect architecture/security/cost/performance, **stop and ask the user targeted questions** before proceeding.

## Mission

Build a single Git repository that runs **Princeton Sentinel** (a Data Posture Dashboard for Microsoft 365) using Docker Compose with three containers:

- **postgres (Postgres 16)**: system of record, scheduling metadata, typed Graph ingestion tables, materialized views
- **web (Next.js)**: dashboard UI + API (server-side only Graph calls), declares schedules/intents, never runs jobs
- **worker (Python + Flask)**: scheduler loop (no cron), Microsoft Graph ingestion, permission scans, MV refresh

## Non‑Negotiables (MUST / MUST NOT)

### Scheduling & compute
- **MUST NOT** use system cron (host or container).
- **MUST NOT** execute jobs in the web container.
- **MUST** enforce schedules in the worker by polling Postgres (`next_run_at <= now()`).
- **MUST** use Postgres advisory locks per job to prevent concurrent execution.
- **MUST** keep web lightweight; heavy work stays in worker.

### Authentication & security
- **MUST** use Microsoft Entra (Microsoft Identity Platform).
- **MUST** keep Microsoft Graph tokens **server-side only** (never expose to browser).
- **MUST** use a **single Entra app registration** for both the web app and worker.
- Worker API is **internal-only** in Docker Compose (no host port); expose worker controls via a **web admin page**.
- **MUST** record system-level audit events in Postgres (`audit_events`) for “who did what”.

### Microsoft Graph scope (initial)
- Target: **Commercial** tenants; **v1.0 endpoints only** (`https://graph.microsoft.com/v1.0`).
- Ingest and dashboard scope v1: **users, groups, sites, drives, drive_items**.
- Ingest **all sites and drives**, perform **full drive item inventory**, and ingest **permissions for all files**.
- Use **delta links** wherever available. Where delta is not available (notably permissions), implement resumable scanning.

### Data posture model
- Database is the default source for dashboard aggregates; Graph is used for “live truth” drill-down/verification.
- Store **latest state only** (no historical versions), but **use soft-deletes** (`deleted_at`) and surface them in the UI.
- Flatten most Graph objects into typed columns AND store `raw_json` for debugging.

### Materialized views
- Postgres 16.
- Any MV must support `REFRESH MATERIALIZED VIEW CONCURRENTLY` and therefore must have a **unique index**.
- Worker refreshes **only impacted** MVs using `table_update_log` + MV dependency metadata.

## Repository Layout (root)

Generate the runnable stack at repo root:

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

## Database Requirements (Postgres 16)

### Scheduling tables (required)
Create exactly (names/columns preserved):
- `jobs(job_id uuid pk, job_type text, tenant_id text, config jsonb, enabled boolean)`
- `job_schedules(schedule_id uuid pk, job_id uuid fk, cron_expr text, next_run_at timestamptz, enabled boolean)`
- `job_runs(run_id uuid pk, job_id uuid, started_at timestamptz, finished_at timestamptz, status text, error text)`

Rules:
- Worker polls for `next_run_at <= now()` and uses row locks + advisory locks.
- Cron is **standard 5-field** (minute resolution; no seconds).

### Audit table (required)
- `audit_events(event_id uuid pk, occurred_at timestamptz, actor_oid text, actor_upn text, actor_name text, action text, entity_type text, entity_id text, details jsonb)`

Write audit events for:
- job/schedule CRUD + enable/disable
- “run now”, pause/resume
- worker job executions (start/success/failure) and significant ingestion milestones

### Update tracking (required)
- `table_update_log(table_name text pk, last_updated_at timestamptz)`

### Microsoft Graph typed tables (initial; extend as needed)
General rules:
- Upsert by Graph `id`
- `synced_at` when the system last fetched/upserted the row
- `deleted_at` for soft delete (set on `@removed`, clear if reappears)
- Store `raw_json` (latest only)

Initial tables include (exact columns may evolve, but keep the intent):
- `msgraph_users(...)`
- `msgraph_groups(...)`
- `msgraph_sites(...)`
- `msgraph_drives(...)` (include SharePoint + OneDrive; `site_id` nullable for personal drives)
- `msgraph_drive_items(...)` (store path/parent, timestamps, size, hash when available, and `permissions_last_synced_at`)
- `msgraph_drive_item_permissions(...)`
- `msgraph_drive_item_permission_grants(...)`
- `msgraph_delta_state(resource_type, partition_key, delta_link, last_synced_at, pk(resource_type, partition_key))`

### Materialized views (initial)
Provide MVs used by the dashboard (names from `PLAN.md`):
- `mv_msgraph_inventory_summary`
- `mv_msgraph_sharing_posture_summary`
- `mv_latest_job_runs`

Each MV must have a unique index to allow concurrent refresh.

## Worker Responsibilities (Python/Flask)

### Control plane API (internal-only)
Provide endpoints (exact pathing can follow `PLAN.md`):
- `GET /health`
- `GET /jobs/status`
- `POST /jobs/run-now`
- `POST /jobs/pause`
- `POST /jobs/resume`

### Scheduler loop (no cron)
- Poll every `SCHEDULER_POLL_SECONDS`.
- Select due schedules with `FOR UPDATE SKIP LOCKED`.
- Acquire `pg_try_advisory_lock` per `job_id`.
- Insert/update `job_runs` with `running|success|failed`.
- Compute and persist `next_run_at` from 5-field cron.

### Graph ingestion job behavior
- Use MSAL client credentials (app-only) against `https://graph.microsoft.com/.default`.
- Use delta queries wherever available; store `deltaLink` in `msgraph_delta_state`.
- Ingest all sites/drives and full drive item inventory.
- Ingest permissions for all file items and persist to permission tables.
- Permissions have no delta API: implement resumable, batched scans using `permissions_last_synced_at` and job config (batch size, time budget).
- Respect rate limits: retry with backoff on 429/5xx.

### MV refresh job behavior
- Refresh only impacted MVs based on `table_update_log` and dependency metadata.
- Use `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

## Web Responsibilities (Next.js)

### UI
Provide pages (minimum):
- `/analytics` (reads MVs; shows “Last Refreshed At”; includes soft-deleted visibility)
- `/jobs` (manage jobs + schedules; web declares intent only)
- `/runs` (job run history)
- `/admin` (worker status + run-now controls; worker is internal-only)

Use Tailwind CSS.

### API routes
- DB-backed endpoints for dashboard/MVs and job/schedule CRUD.
- Real-time Graph drill-down endpoints (server-side only, app-only Graph token):
  - `GET /api/graph/drive-item-permissions?driveId=&itemId=`
  - `GET /api/graph/drive-item-sharing?driveId=&itemId=`
  - `GET /api/graph/site-access?siteId=`
- These endpoints must not persist responses; they are “verify live truth”.

## Hybrid Data Contract (UI)
- Clearly label cached vs live:
  - Dashboard charts/summary: “Cached (DB) — Last refreshed at …”
  - Drill-down views: “Live (Graph)”
- Partial failure allowed: Graph drill-down failures must not break cached dashboard views.

## What to Ask the User (before or during implementation)

If any of these are missing, ask before proceeding:
- Entra tenant ID
- Entra app: client ID/secret, redirect URIs, scopes, Worker API audience/scope/app-role configuration, and Graph application permissions (admin-consented)
- Expected scan scale and guardrails: acceptable duration for first full scan, schedule frequency, max concurrency/QPS, and any exclusions if the tenant is huge

## Implementation Discipline
- Follow `PLAN.md` as the source of truth; do not drift.
- Keep dependencies minimal and commonly supported.
- Don’t introduce cron, queues, Celery, Redis, or cloud infrastructure in v1.
- Don’t invent extra services/containers beyond postgres/web/worker.
- When in doubt about scope or security, ask the user instead of guessing.
