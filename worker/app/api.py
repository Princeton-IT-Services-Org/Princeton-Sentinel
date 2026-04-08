from http import HTTPStatus
from threading import Thread
from flask import Flask, g, jsonify, request

from app import db
from app.auth import require_internal_token
from app.conditional_access import ConditionalAccessManager, CAResult
from app.dataverse_client import DataverseClient
from app.heartbeat import get_heartbeat_status, is_heartbeat_healthy
from app.license import (
    LicenseFeatureError,
    get_current_license,
    get_job_type_license_feature,
    get_license_lookup_failure_summary,
    require_license_feature,
)
from app.runtime_logger import emit
from app.scheduler import get_scheduler_status, run_job_once
from app.utils import log_audit_event


def _actor_from_body(body):
    actor = body.get("actor") or {}
    return {
        "oid": actor.get("oid"),
        "upn": actor.get("upn"),
        "name": actor.get("name"),
    }


def _job_id_from_body(body):
    value = body.get("job_id")
    if value is None:
        return None
    value = str(value).strip()
    return value or None


def _status_phrase(code: int) -> str:
    try:
        return HTTPStatus(code).phrase
    except ValueError:
        return "Unknown Status"


def _response_error_summary(response) -> str:
    payload = response.get_json(silent=True)
    if isinstance(payload, dict):
        if payload.get("error"):
            return str(payload.get("error"))
        if payload.get("message"):
            return str(payload.get("message"))
    body = response.get_data(as_text=True) or ""
    body = body.replace("\n", " ").replace("\r", " ").strip()
    if not body:
        return "unspecified_error"
    if len(body) > 220:
        return body[:217] + "..."
    return body


def _safe_license_summary(context: str):
    try:
        return get_current_license()
    except Exception as exc:
        text = str(exc).replace("\n", " ").replace("\r", " ").strip() or "license_lookup_failed"
        if len(text) > 220:
            text = text[:217] + "..."
        emit("ERROR", "FLASK_API", f"{context} license lookup failed: error={text}")
        return get_license_lookup_failure_summary(text)


def _classify_dv_error(exc: Exception) -> str:
    msg = str(exc)
    msg_lower = msg.lower()
    if "dataverse_url must be set" in msg_lower or "entra_" in msg_lower:
        return "not_configured"
    if "failed to acquire" in msg_lower or "(401)" in msg or "unauthorized" in msg_lower:
        return "auth_failed"
    if "(403)" in msg or "forbidden" in msg_lower:
        return "permission_denied"
    if "timed out" in msg_lower or "connectionerror" in msg_lower or "failed to establish" in msg_lower or "(503)" in msg:
        return "unreachable"
    return "unknown"


def create_app():
    app = Flask(__name__)

    @app.before_request
    def log_request_start():
        g._log_method = request.method
        g._log_path = request.path
        emit("INFO", "FLASK_API", f"Request received: {request.method} {request.path}")

    @app.after_request
    def log_request_end(response):
        method = getattr(g, "_log_method", request.method)
        path = getattr(g, "_log_path", request.path)
        status = response.status_code
        phrase = _status_phrase(status)
        if 200 <= status < 300:
            emit("INFO", "FLASK_API", f"Response sent: {status} {phrase} for {method} {path}")
        else:
            error_summary = _response_error_summary(response)
            level = "WARN" if status < 500 else "ERROR"
            emit(
                level,
                "FLASK_API",
                f"Response sent: {status} {phrase} for {method} {path}; error={error_summary}",
            )
        return response

    @app.teardown_request
    def log_request_exception(exc):
        if exc is None:
            return
        method = getattr(g, "_log_method", "UNKNOWN")
        path = getattr(g, "_log_path", "UNKNOWN")
        text = str(exc).replace("\n", " ").replace("\r", " ").strip()
        if len(text) > 220:
            text = text[:217] + "..."
        emit("ERROR", "FLASK_API", f"Unhandled exception during {method} {path}: error={text}")

    @app.get("/health")
    @require_internal_token
    def health():
        try:
            db.fetch_one("SELECT 1 AS ok")
            db_ok = True
        except Exception:
            db_ok = False
        heartbeat = get_heartbeat_status()
        license_summary = _safe_license_summary("Health check")
        return jsonify(
            {
                "ok": db_ok and is_heartbeat_healthy(),
                "db": db_ok,
                "scheduler": get_scheduler_status(),
                "heartbeat": heartbeat,
                "license": license_summary,
            }
        )

    @app.get("/jobs/status")
    @require_internal_token
    def jobs_status():
        rows = db.fetch_all(
            """
            SELECT j.job_id, j.job_type, j.enabled,
                   js.schedule_id, js.cron_expr, js.next_run_at, js.enabled AS schedule_enabled,
                   m.run_id, m.started_at, m.finished_at, m.status, m.status AS latest_run_status, m.error
            FROM jobs j
            LEFT JOIN job_schedules js ON js.job_id = j.job_id
            LEFT JOIN LATERAL (
                SELECT run_id, started_at, finished_at, status, error
                FROM job_runs
                WHERE job_id = j.job_id
                ORDER BY started_at DESC NULLS LAST, run_id DESC
                LIMIT 1
            ) m ON true
            ORDER BY j.job_type
            """
        )
        return jsonify({"jobs": rows, "license": _safe_license_summary("Jobs status")})

    @app.post("/jobs/run-now")
    @require_internal_token
    def run_now():
        body = request.get_json(silent=True) or {}
        job_id = _job_id_from_body(body)
        if not job_id:
            return jsonify({"error": "job_id_required"}), 400

        job = db.fetch_one("SELECT job_id, job_type FROM jobs WHERE job_id = %s", [job_id])
        if not job:
            return jsonify({"error": "job_not_found"}), 404

        try:
            require_license_feature("job_control")
            feature_key = get_job_type_license_feature(job.get("job_type"))
            if feature_key:
                require_license_feature(feature_key)
        except LicenseFeatureError as exc:
            return jsonify({"error": str(exc), "license": exc.summary}), 403

        actor = _actor_from_body(body)
        log_audit_event(
            action="job_run_requested",
            entity_type="job",
            entity_id=job_id,
            actor=actor,
            details={"job_type": job["job_type"]},
        )

        thread = Thread(target=run_job_once, args=(job, actor))
        thread.daemon = True
        thread.start()

        return jsonify({"status": "queued"}), 202

    @app.post("/jobs/pause")
    @require_internal_token
    def pause_job():
        body = request.get_json(silent=True) or {}
        job_id = _job_id_from_body(body)
        if not job_id:
            return jsonify({"error": "job_id_required"}), 400

        job = db.fetch_one("SELECT job_id, job_type FROM jobs WHERE job_id = %s", [job_id])
        if not job:
            return jsonify({"error": "job_not_found"}), 404

        try:
            require_license_feature("job_control")
        except LicenseFeatureError as exc:
            return jsonify({"error": str(exc), "license": exc.summary}), 403

        updated = db.execute("UPDATE job_schedules SET enabled = false, next_run_at = NULL WHERE job_id = %s", [job_id])
        if updated <= 0:
            return jsonify({"error": "schedule_not_found"}), 404

        log_audit_event(
            action="job_paused",
            entity_type="job",
            entity_id=job_id,
            actor=_actor_from_body(body),
            details={"job_type": job["job_type"]},
        )
        return jsonify({"status": "paused"})

    @app.post("/jobs/resume")
    @require_internal_token
    def resume_job():
        body = request.get_json(silent=True) or {}
        job_id = _job_id_from_body(body)
        if not job_id:
            return jsonify({"error": "job_id_required"}), 400

        job = db.fetch_one("SELECT job_id, job_type FROM jobs WHERE job_id = %s", [job_id])
        if not job:
            return jsonify({"error": "job_not_found"}), 404

        try:
            require_license_feature("job_control")
        except LicenseFeatureError as exc:
            return jsonify({"error": str(exc), "license": exc.summary}), 403

        updated = db.execute("UPDATE job_schedules SET enabled = true, next_run_at = NULL WHERE job_id = %s", [job_id])
        if updated <= 0:
            return jsonify({"error": "schedule_not_found"}), 404
        # Resume should restore job-level enablement for legacy/pre-upgrade disabled rows.
        db.execute("UPDATE jobs SET enabled = true WHERE job_id = %s", [job_id])

        log_audit_event(
            action="job_resumed",
            entity_type="job",
            entity_id=job_id,
            actor=_actor_from_body(body),
            details={"job_type": job["job_type"]},
        )
        return jsonify({"status": "resumed"})

    # ── Conditional Access: agent kill-switch ─────────────────────────

    @app.post("/conditional-access/block")
    @require_internal_token
    def ca_block_user():
        body = request.get_json(silent=True) or {}
        user_id = (body.get("user_id") or "").strip()
        bot_id = (body.get("bot_id") or "").strip()
        bot_name = (body.get("bot_name") or "").strip()
        block_scope = (body.get("block_scope") or "agent").strip()
        actor = _actor_from_body(body)

        if not user_id or not bot_id:
            return jsonify({"error": "user_id and bot_id are required"}), 400

        # scope=agent → app-level only, no Entra CA needed
        if block_scope == "agent":
            log_audit_event(
                action="copilot_access_block",
                entity_type="copilot_access_block",
                entity_id=f"{user_id}:{bot_id}",
                actor=actor,
                details={"user_id": user_id, "bot_id": bot_id, "block_scope": "agent"},
            )
            return jsonify({"status": "blocked", "block_scope": "agent"})

        # scope=all → create/update Entra Conditional Access policy
        ca = ConditionalAccessManager()
        result: CAResult = ca.block_user(bot_id, bot_name, user_id)

        log_audit_event(
            action="copilot_access_block",
            entity_type="copilot_access_block",
            entity_id=f"{user_id}:{bot_id}",
            actor=actor,
            details={
                "user_id": user_id,
                "bot_id": bot_id,
                "block_scope": "all",
                "sync_success": result.success,
                "policy_id": result.policy_id,
                "error": result.error,
            },
        )

        if result.success:
            return jsonify({"status": "blocked", "policy_id": result.policy_id, "block_scope": "all"})
        return jsonify({"error": result.error, "status": "sync_failed"}), 502

    @app.post("/conditional-access/unblock")
    @require_internal_token
    def ca_unblock_user():
        body = request.get_json(silent=True) or {}
        user_id = (body.get("user_id") or "").strip()
        bot_id = (body.get("bot_id") or "").strip()
        block_scope = (body.get("block_scope") or "agent").strip()
        actor = _actor_from_body(body)

        if not user_id or not bot_id:
            return jsonify({"error": "user_id and bot_id are required"}), 400

        # scope=agent → no Entra CA to clean up
        if block_scope == "agent":
            log_audit_event(
                action="copilot_access_unblock",
                entity_type="copilot_access_block",
                entity_id=f"{user_id}:{bot_id}",
                actor=actor,
                details={"user_id": user_id, "bot_id": bot_id, "block_scope": "agent"},
            )
            return jsonify({"status": "unblocked", "block_scope": "agent"})

        # scope=all → remove user from Entra CA policy
        ca = ConditionalAccessManager()
        result: CAResult = ca.unblock_user(bot_id, user_id)

        log_audit_event(
            action="copilot_access_unblock",
            entity_type="copilot_access_block",
            entity_id=f"{user_id}:{bot_id}",
            actor=actor,
            details={
                "user_id": user_id,
                "bot_id": bot_id,
                "block_scope": "all",
                "sync_success": result.success,
                "policy_id": result.policy_id,
                "error": result.error,
            },
        )

        if result.success:
            return jsonify({"status": "unblocked", "policy_id": result.policy_id, "block_scope": "all"})
        return jsonify({"error": result.error, "status": "sync_failed"}), 502

    # ── Global agent disable/enable ─────────────────────────────────

    @app.post("/conditional-access/disable-agent")
    @require_internal_token
    def ca_disable_agent():
        body = request.get_json(silent=True) or {}
        bot_id = (body.get("bot_id") or "").strip()
        reason = (body.get("reason") or "").strip()
        actor = _actor_from_body(body)

        if not bot_id:
            return jsonify({"error": "bot_id is required"}), 400

        agent_reg = db.fetch_one(
            "SELECT app_registration_id, app_object_id FROM copilot_agent_registrations WHERE bot_id = %s",
            [bot_id],
        )
        if not agent_reg:
            return jsonify({"error": "agent_not_registered"}), 400

        ca = ConditionalAccessManager()

        # Always resolve the service principal object ID. Older rows may cache the
        # application object ID, which cannot be patched with accountEnabled.
        service_principal_object_id = ca.get_service_principal_object_id(agent_reg["app_registration_id"])
        if not service_principal_object_id:
            return jsonify({"error": "service_principal_not_found_in_entra"}), 404
        if agent_reg["app_object_id"] != service_principal_object_id:
            db.execute(
                "UPDATE copilot_agent_registrations SET app_object_id = %s, updated_at = now() WHERE bot_id = %s",
                [service_principal_object_id, bot_id],
            )

        result = ca.disable_agent(service_principal_object_id)

        if result.success:
            db.execute(
                "UPDATE copilot_agent_registrations SET disabled_at = now(), disabled_by = %s, disabled_reason = %s, updated_at = now() WHERE bot_id = %s",
                [actor.get("upn") or actor.get("oid") or "unknown", reason or None, bot_id],
            )
            log_audit_event(
                action="copilot_agent_disabled",
                entity_type="copilot_agent",
                entity_id=bot_id,
                actor=actor,
                details={"reason": reason, "service_principal_object_id": service_principal_object_id},
            )
            return jsonify({"status": "disabled"})

        return jsonify({"error": result.error, "status": "disable_failed"}), 502

    @app.post("/conditional-access/enable-agent")
    @require_internal_token
    def ca_enable_agent():
        body = request.get_json(silent=True) or {}
        bot_id = (body.get("bot_id") or "").strip()
        actor = _actor_from_body(body)

        if not bot_id:
            return jsonify({"error": "bot_id is required"}), 400

        agent_reg = db.fetch_one(
            "SELECT app_registration_id, app_object_id FROM copilot_agent_registrations WHERE bot_id = %s",
            [bot_id],
        )
        if not agent_reg:
            return jsonify({"error": "agent_not_registered"}), 400

        ca = ConditionalAccessManager()
        service_principal_object_id = ca.get_service_principal_object_id(agent_reg["app_registration_id"])
        if not service_principal_object_id:
            return jsonify({"error": "service_principal_not_found_in_entra"}), 404
        if agent_reg["app_object_id"] != service_principal_object_id:
            db.execute(
                "UPDATE copilot_agent_registrations SET app_object_id = %s, updated_at = now() WHERE bot_id = %s",
                [service_principal_object_id, bot_id],
            )

        result = ca.enable_agent(service_principal_object_id)

        if result.success:
            db.execute(
                "UPDATE copilot_agent_registrations SET disabled_at = NULL, disabled_by = NULL, disabled_reason = NULL, updated_at = now() WHERE bot_id = %s",
                [bot_id],
            )
            log_audit_event(
                action="copilot_agent_enabled",
                entity_type="copilot_agent",
                entity_id=bot_id,
                actor=actor,
                details={"service_principal_object_id": service_principal_object_id},
            )
            return jsonify({"status": "enabled"})

        return jsonify({"error": result.error, "status": "enable_failed"}), 502

    # ── Dataverse: fetch table data ────────────────────────────────

    @app.get("/dataverse/table")
    @require_internal_token
    def dataverse_table():
        entity_set = request.args.get("entity_set", "").strip()
        if not entity_set:
            return jsonify({"error": "entity_set query param is required"}), 400

        select = request.args.get("select", "").strip() or None
        odata_filter = request.args.get("filter", "").strip() or None
        top_str = request.args.get("top", "").strip()
        top = int(top_str) if top_str.isdigit() else None

        try:
            dv = DataverseClient()
            rows = dv.fetch_table(entity_set, select=select, filter=odata_filter, top=top)
            return jsonify({"rows": rows, "count": len(rows)})
        except Exception as exc:
            emit("ERROR", "DATAVERSE", f"Dataverse fetch failed: {exc}")
            return jsonify({"error": str(exc), "dv_error_type": _classify_dv_error(exc)}), 502

    @app.post("/dataverse/patch")
    @require_internal_token
    def dataverse_patch():
        body = request.get_json(silent=True) or {}
        entity_set = (body.get("entity_set") or "").strip()
        row_id = (body.get("row_id") or "").strip()
        data = body.get("data") or {}

        if not entity_set or not row_id:
            return jsonify({"error": "entity_set and row_id are required"}), 400
        if not isinstance(data, dict) or not data:
            return jsonify({"error": "data must be a non-empty object"}), 400

        try:
            dv = DataverseClient()
            dv.patch_row(entity_set, row_id, data)
            return jsonify({"status": "updated"})
        except Exception as exc:
            emit("ERROR", "DATAVERSE", f"Dataverse patch failed: {exc}")
            return jsonify({"error": str(exc), "dv_error_type": _classify_dv_error(exc)}), 502

    return app
