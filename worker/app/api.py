from threading import Thread
from flask import Flask, jsonify, request

from app import db
from app.scheduler import get_scheduler_status, run_job_once
from app.utils import log_audit_event


def _actor_from_body(body):
    actor = body.get("actor") or {}
    return {
        "oid": actor.get("oid"),
        "upn": actor.get("upn"),
        "name": actor.get("name"),
    }


def create_app():
    app = Flask(__name__)

    @app.get("/health")
    def health():
        try:
            db.fetch_one("SELECT 1 AS ok")
            db_ok = True
        except Exception:
            db_ok = False
        return jsonify({"ok": True, "db": db_ok, "scheduler": get_scheduler_status()})

    @app.get("/jobs/status")
    def jobs_status():
        rows = db.fetch_all(
            """
            SELECT j.job_id, j.job_type, j.enabled, j.config,
                   js.schedule_id, js.cron_expr, js.next_run_at, js.enabled AS schedule_enabled,
                   m.run_id, m.started_at, m.finished_at, m.status, m.error
            FROM jobs j
            LEFT JOIN job_schedules js ON js.job_id = j.job_id
            LEFT JOIN mv_latest_job_runs m ON m.job_id = j.job_id
            ORDER BY j.job_type
            """
        )
        return jsonify({"jobs": rows})

    @app.post("/jobs/run-now")
    def run_now():
        body = request.get_json(silent=True) or {}
        job_id = body.get("job_id")
        if not job_id:
            return jsonify({"error": "job_id_required"}), 400

        job = db.fetch_one("SELECT job_id, job_type, config FROM jobs WHERE job_id = %s", [job_id])
        if not job:
            return jsonify({"error": "job_not_found"}), 404

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
    def pause_job():
        body = request.get_json(silent=True) or {}
        job_id = body.get("job_id")
        if not job_id:
            return jsonify({"error": "job_id_required"}), 400

        db.execute("UPDATE jobs SET enabled = false WHERE job_id = %s", [job_id])
        db.execute("UPDATE job_schedules SET enabled = false WHERE job_id = %s", [job_id])

        log_audit_event(
            action="job_paused",
            entity_type="job",
            entity_id=job_id,
            actor=_actor_from_body(body),
            details={},
        )
        return jsonify({"status": "paused"})

    @app.post("/jobs/resume")
    def resume_job():
        body = request.get_json(silent=True) or {}
        job_id = body.get("job_id")
        if not job_id:
            return jsonify({"error": "job_id_required"}), 400

        db.execute("UPDATE jobs SET enabled = true WHERE job_id = %s", [job_id])
        db.execute("UPDATE job_schedules SET enabled = true WHERE job_id = %s", [job_id])

        log_audit_event(
            action="job_resumed",
            entity_type="job",
            entity_id=job_id,
            actor=_actor_from_body(body),
            details={},
        )
        return jsonify({"status": "resumed"})

    return app
