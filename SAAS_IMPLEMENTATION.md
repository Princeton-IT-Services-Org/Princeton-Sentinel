# SAAS_IMPLEMENTATION.md
## Princeton Sentinel SaaS Licensing + Central Disablement Plan

This document describes how to add **centralized licensing + feature gating** to **Princeton Sentinel** (Next.js webapp + Python worker + Postgres), and how to build a separate **Central Licensing Authority (CLA)** service hosted in *your* Azure tenant.

> Each client deployment will provide a `PRINCETON_LICENSE_ID` via env var. The **worker** (and web) will call the CLA to validate and cache results **in memory** with a TTL.

---

# 1) Changes to Princeton Sentinel Application

## 1.1 Goals and non-goals

### Goals
- Centralized ability to **expire/suspend** a client and have it take effect quickly.
- When expired: client becomes **read-only**:
  - dashboards + cached analytics remain available
  - advanced features disabled (e.g., Graph ingestion, permission revoke, “run now”, schedule changes)
- Works at scale: many client tenants.
- Minimal client-side state: license status cached **in memory** only (with TTL).

### Non-goals / realities
- If the client controls the runtime, they can:
  - change env vars,
  - block outbound calls,
  - modify the container image,
  - or patch code.

  **You cannot make this cryptographically “unbreakable” on infrastructure you do not control.**
  What you *can* do is make bypassing licensing require deliberate tampering (contract violation) and make the default system safe:
  - enforce license checks in **multiple layers** (web + worker),
  - use **signed license tokens**,
  - short TTL + safe fallback (“read-only”),
  - and optional “phone-home required” policies.

## 1.2 New configuration (env vars)

Add these to `.env.example` (and require them at runtime):

- `PRINCETON_LICENSE_ID`  
  A unique license identifier issued by the CLA. Consider UUID.
- `PRINCETON_LICENSE_AUTH_MODE` = `client_secret`  
  How the client deployment authenticates to the CLA. For this version lets just stick to client_secret. Not a compulsory variable. Should be baked into code.
- `PRINCETON_LICENSE_API_BASE_URL`  
  e.g., `https://license.yourcompany.com`
- `PRINCETON_LICENSE_TTL_SECONDS`  
  Recommended: 12hrs. Also not compulsory, should be baked into code.
- `PRINCETON_LICENSE_FAIL_MODE` = `read_only|deny_all`  
  Recommended: `read_only`

## 1.3 License enforcement model (must be defense-in-depth)

Enforce licensing in **both**:
1) **Web app API routes** (the true control plane for UI actions)
2) **Worker job execution / scheduler** (the true data-plane for ingestion)

### What gets gated
- `graph_ingest` job execution and schedule changes
- Disable all CRON jobs
- any “write” actions: revoke permissions, change policies, modify schedules
- worker “run now controls”
- any new ingestion / MV refresh triggers if you treat those as premium

### What remains available on expiry
- Cached dashboards backed by Postgres materialized views (existing data)
- run history and previously stored logs (read-only)
- Do not allow revoke functionality on file detail level drilldowns.

## 1.4 License check flow (with TTL in memory)

### Core idea
- A lightweight `LicenseClient` exists in both web and worker.
- It calls CLA `/v1/licenses/validate` using `PRINCETON_LICENSE_ID`.
- The response is a **signed token** (JWT or similar) with:
  - status: `active|expired|suspended`
  - expiry timestamp
  - features object
  - `valid_until` = `now + TTL` (client-side cache window)
- The app caches the parsed/verified result **in memory** until `valid_until`.
- When cache expires, it revalidates.

### Why signed tokens
- Prevents trivial MITM or response tampering.
- Client embeds CLA **public key** and verifies signature locally.

### Recommended validation cadence
- Web: validate on startup, then lazily on first gated request after TTL.
- Worker: validate at loop start and **before each job run** (or at least each scheduler tick).

### Safe fallback when CLA is unreachable
Depending on `PRINCETON_LICENSE_FAIL_MODE`:
- `read_only` (recommended): disable write/ingest features, allow dashboards.
- `deny_all`: block everything, including read-only dashboards.

Also apply a **maximum offline grace**:
- If last successful validation is older than `N` hours (e.g., 48h), force `read_only` or `deny_all`.

## 1.5 Web app implementation outline (Next.js)

### A) Add a license module
Create `src/lib/license/`:
- `licenseClient.ts`:
  - `getLicense()` -> returns cached license state
  - `requireFeature(featureName)` -> throws/returns 403 if not enabled
  - signature verification using embedded public key
- `licenseTypes.ts`: types for status/features
- `licenseMiddleware.ts`: helper for API routes

### B) Gate API routes (server-side)
For each sensitive API route (jobs, schedules, revoke, run-now):
- Call `requireFeature("graph_ingest")` etc.
- If expired/suspended: return 403 + payload that UI uses to show upsell/expired messaging.

### C) UI gating (nice-to-have)
- Hide/disable controls based on license state.
- BUT treat UI gating as cosmetic; **API enforcement is mandatory**.
- Add Dialog box to show **License Expired** message when License verification fails or expires.

### D) Optional: show license banner
- “License expires on …”
- “Read-only mode: Contact admin to renew”

## 1.6 Worker implementation outline (Python/Flask + scheduler loop)

### A) Add a license module
Create `worker/license_client.py`:
- `LicenseClient` with:
  - in-memory cache: `current_license`, `valid_until`, `last_success_at`
  - `validate()` calls CLA and verifies signature
  - `get()` returns cached if fresh else validate
  - `is_feature_enabled(feature)` convenience

### B) Enforce before executing work
In scheduler loop:
- Before picking runnable jobs:
  - `lic = license_client.get()`
  - If status not `active`, do NOT run jobs.
- Before executing each job:
  - `require_feature("graph_ingest")` etc.

### C) Worker heartbeat (optional)
If you already send heartbeat to web, include:
- license status/mode
- last validation time
So the UI can show “worker disabled due to license”.

## 1.7 Feature matrix (example)

Define canonical feature keys used everywhere:

- `dashboards_read`: true (always)
- `live_graph_drilldown`
- `graph_ingest`
- `schedule_manage`
- `permission_revoke`
- `admin_controls`
- `export_reports`

On expiry, CLA returns:
- `dashboards_read: true`
- `live_graph_drilldown: true`
- everything else false

## 1.8 Hardening recommendations (practical)

These are optional, but recommended if you expect adversarial customers:

1) **Outbound allow-list requirement**  
   Document that the client deployment must allow HTTPS to your CLA domain(s).
2) **Multi-layer enforcement**  
   Web API + worker.
3) **Tenant binding**  
   CLA token includes customer `azure_tenant_id` and the client includes it in request; mismatch => `suspended`.
4) **Detect obvious tampering** (best-effort)
   - container image signature checks (if you distribute signed images)
   - “build fingerprint” included in request
5) **Grace policy**  
   Keep dashboards accessible during outages; block ingestion/writes.

---

# 2) New Project: Central Licensing Authority (CLA) App (Your Tenant)

## 2.1 What the CLA is
A service you operate in **your** Azure tenant that provides:
- Admin portal for managing customers and licenses
- Validation API that client deployments call
- Signed license tokens (JWT)
- Audit logs + optional usage metering

## 2.2 Recommended Azure deployment
Choose one:

### Option A (simple, solid)
- Azure Container Apps (API + Admin UI)
- Azure Database for PostgreSQL Flexible Server (license store)
- Azure Key Vault (JWT signing key + secrets)
- Azure Front Door (optional) for global entrypoint

### Option B (classic)
- Azure App Service (API + Admin)
- Azure PostgreSQL
- Key Vault

## 2.3 CLA components

### A) License Admin Portal (Control Plane)
- UI where you:
  - create customer
  - issue `license_id`
  - set `expires_at`
  - suspend/reactivate
  - set feature tiers
  - view validation logs

Tech:
- Next.js (admin app)
- or any framework you prefer

### B) License Validation API (Data Plane)
Endpoints:

1) `POST /v1/licenses/validate`
Request:
```json
{
  "license_id": "uuid",
  "azure_tenant_id": "optional-but-recommended",
  "instance_id": "optional",
  "app_version": "optional",
  "deployment_fingerprint": "optional"
}
```

Response (signed token + parsed payload):
```json
{
  "token": "<signed_jwt>",
  "payload": {
    "license_id": "uuid",
    "status": "active|expired|suspended",
    "expires_at": "ISO8601",
    "valid_until": "ISO8601",
    "features": { "graph_ingest": true, "permission_revoke": true },
    "mode": "full|read_only"
  }
}
```

2) Optional `GET /v1/public-keys/current`
- provides public key for signature verification / key rotation

3) Optional `POST /v1/telemetry/heartbeat`
- collects basic usage/health signals

### C) License DB
Tables (minimal):
- `customers`
  - `id`, `name`, `azure_tenant_id`, `created_at`
- `licenses`
  - `id` (license_id)
  - `customer_id`
  - `status` (active/suspended)
  - `starts_at`, `expires_at`
  - `plan` (trial/standard/enterprise)
  - `features_json` (jsonb)
  - `max_users` (optional)
  - `created_at`, `updated_at`
- `license_validation_logs`
  - `id`, `license_id`, `ts`, `source_ip`, `instance_id`, `result_status`, `app_version`

## 2.4 Authentication and security for validate calls

You need *some* auth so random callers can’t enumerate licenses.

### Client secret per license
- CLA stores `client_secret_hash`
- Client sends header `Authorization: Bearer <secret>`
- Rotate secrets on renewal

## 2.5 Token signing and key management

### Signing
- CLA signs JWT with a private key (RSA/ECDSA).
- Private key stored in Azure Key Vault.
- JWT includes:
  - `iss` = your CLA
  - `aud` = "princeton-sentinel"
  - `sub` = license_id
  - `exp` = `valid_until` (TTL)
  - `claims`: status, features, expires_at, tenant binding

### Verification
- Princeton Sentinel containers embed the CLA **public key** (or fetch it from `GET /public-keys/current`).
- Validate signature + issuer/audience.
- Reject if:
  - signature invalid
  - `exp` passed
  - tenant_id mismatch (if enforced)

### Key rotation
- Support `kid` in JWT header.
- Maintain multiple active public keys until rollout completes.

## 2.6 License policies

### Expiry handling
- When `now > expires_at`:
  - status becomes `expired`
  - mode `read_only`
  - features set accordingly

### Suspension
- Manual kill switch: set `status=suspended`
- CLA returns `suspended` immediately

### Grace and TTL
- `valid_until = now + TTL` (e.g., 1 hour)
- Shorter TTL = faster disable, more traffic
- Typical:
  - TTL 1h for normal
  - TTL 5–15m for strict enforcement

## 2.7 Admin portal UX (minimum viable)
Screens:
- Customers list + create customer
- Customer details:
  - tenant id
  - licenses list
- License details:
  - expires_at picker
  - status toggle (active/suspended)
  - plan tier
  - feature flags (json editor or checkboxes)
- Validation logs view

## 2.8 Operational notes
- Rate limit validate endpoint.
- Log suspicious activity (many invalid IDs).
- Prefer HA:
  - at least 2 replicas of API
  - Postgres backups + PITR
- Monitoring:
  - Application Insights
  - alerts on error rates

---

# Implementation handoff checklist (for Codex agent)

## Sentinel-side
- [ ] Add env vars + validation config
- [ ] Implement license client (Next.js)
- [ ] Gate all sensitive API routes
- [ ] Implement worker license client (Python) with TTL in memory
- [ ] Gate scheduler + job execution
- [ ] Add UI messaging for read-only mode

## CLA-side
- [ ] Create CLA API service (validate endpoint)
- [ ] Create admin portal
- [ ] Create Postgres schema and migrations
- [ ] Implement JWT signing + Key Vault integration
- [ ] Implement authentication for validate calls (client secret)
- [ ] Add logging + rate limiting
- [ ] Support key rotation (kid)

---

# Suggested repo layout for CLA (example)

- `cla-api/` (FastAPI/Node/.NET)
  - `src/`
  - `migrations/`
  - `Dockerfile`
- `cla-admin/` (Next.js)
  - `app/`
  - `Dockerfile`
- `infra/`
  - `bicep/` or `terraform/`
  - `aca/` manifests
- `docker-compose.yml` (local dev)
- `README.md`
