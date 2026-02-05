import json
import os
import threading
import time
from datetime import datetime, timezone

from croniter import croniter

from app import db
from app.jobs.graph_ingest import run_graph_ingest
from app.utils import log_audit_event, log_job_run_log

SCHEDULER_POLL_SECONDS = int(os.getenv("SCHEDULER_POLL_SECONDS", "30"))

_scheduler_status = {
    "running": False,
    "last_tick": None,
    "last_error": None,
}


def get_scheduler_status():
    return _scheduler_status


def start_scheduler_thread():
    thread = threading.Thread(target=_scheduler_loop, daemon=True)
    thread.start()


def _scheduler_loop():
    _scheduler_status["running"] = True
    while True:
        _scheduler_status["last_tick"] = datetime.now(timezone.utc).isoformat()
        try:
            _run_due_schedule()
            _scheduler_status["last_error"] = None
        except Exception as exc:
            _scheduler_status["last_error"] = str(exc)
        time.sleep(SCHEDULER_POLL_SECONDS)


def _run_due_schedule():
    conn = db.get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT schedule_id, cron_expr
            FROM job_schedules
            WHERE enabled = true
              AND next_run_at IS NULL
            ORDER BY schedule_id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if row:
            schedule_id, cron_expr = row
            next_run_at = _compute_next_run(cron_expr)
            cur.execute(
                "UPDATE job_schedules SET next_run_at = %s WHERE schedule_id = %s",
                [next_run_at, schedule_id],
            )
            conn.commit()
            return

        cur.execute(
            """
            SELECT js.schedule_id, js.job_id, js.cron_expr, j.job_type, j.config
            FROM job_schedules js
            JOIN jobs j ON j.job_id = js.job_id
            WHERE js.enabled = true
              AND j.enabled = true
              AND js.next_run_at <= now()
            ORDER BY js.next_run_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            conn.rollback()
            return

        schedule_id, job_id, cron_expr, job_type, config = row

        cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", [str(job_id)])
        locked = cur.fetchone()[0]
        if not locked:
            conn.rollback()
            return

        run_id = _insert_job_run(cur, job_id)
        next_run_at = _compute_next_run(cron_expr)
        cur.execute(
            "UPDATE job_schedules SET next_run_at = %s WHERE schedule_id = %s",
            [next_run_at, schedule_id],
        )
        conn.commit()

        log_audit_event(
            action="job_run_started",
            entity_type="job_run",
            entity_id=str(run_id),
            actor=None,
            details={"job_id": str(job_id), "job_type": job_type, "trigger": "schedule"},
        )

        status, error = _execute_job(job_type, config, run_id=str(run_id), job_id=str(job_id), actor_claims=None)

        cur.execute(
            "UPDATE job_runs SET finished_at = now(), status = %s, error = %s WHERE run_id = %s",
            [status, error, run_id],
        )
        cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", [str(job_id)])
        conn.commit()

        log_audit_event(
            action="job_run_%s" % ("succeeded" if status == "success" else "failed"),
            entity_type="job_run",
            entity_id=str(run_id),
            actor=None,
            details={"job_id": str(job_id), "job_type": job_type, "trigger": "schedule", "error": error},
        )

        log_job_run_log(
            run_id=str(run_id),
            level="INFO" if status == "success" else "ERROR",
            message="job_finished",
            context={"job_id": str(job_id), "job_type": job_type, "trigger": "schedule", "status": status, "error": error},
        )
    finally:
        conn.close()


def run_job_once(job, actor_claims=None):
    job_id = job["job_id"]
    job_type = job["job_type"]
    config = job.get("config")
    conn = db.get_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT pg_try_advisory_lock(hashtext(%s))", [str(job_id)])
        locked = cur.fetchone()[0]
        if not locked:
            conn.rollback()
            return

        run_id = _insert_job_run(cur, job_id)
        conn.commit()

        log_audit_event(
            action="job_run_started",
            entity_type="job_run",
            entity_id=str(run_id),
            actor=actor_claims,
            details={"job_id": str(job_id), "job_type": job_type, "trigger": "run_now"},
        )

        status, error = _execute_job(
            job_type,
            config,
            run_id=str(run_id),
            job_id=str(job_id),
            actor_claims=actor_claims,
        )

        cur.execute(
            "UPDATE job_runs SET finished_at = now(), status = %s, error = %s WHERE run_id = %s",
            [status, error, run_id],
        )
        cur.execute("SELECT pg_advisory_unlock(hashtext(%s))", [str(job_id)])
        conn.commit()

        log_audit_event(
            action="job_run_%s" % ("succeeded" if status == "success" else "failed"),
            entity_type="job_run",
            entity_id=str(run_id),
            actor=actor_claims,
            details={"job_id": str(job_id), "job_type": job_type, "trigger": "run_now", "error": error},
        )

        log_job_run_log(
            run_id=str(run_id),
            level="INFO" if status == "success" else "ERROR",
            message="job_finished",
            context={"job_id": str(job_id), "job_type": job_type, "trigger": "run_now", "status": status, "error": error},
        )
    finally:
        conn.close()


def _insert_job_run(cur, job_id):
    cur.execute(
        """
        INSERT INTO job_runs (run_id, job_id, started_at, status)
        VALUES (gen_random_uuid(), %s, now(), 'running')
        RETURNING run_id
        """,
        [job_id],
    )
    return cur.fetchone()[0]


def _compute_next_run(cron_expr):
    base = datetime.now(timezone.utc)
    itr = croniter(cron_expr, base)
    return itr.get_next(datetime)


def _execute_job(job_type, config, *, run_id: str, job_id: str, actor_claims=None):
    try:
        if isinstance(config, str):
            config = json.loads(config)
        config = config or {}

        if job_type == "graph_ingest":
            log_job_run_log(run_id=run_id, level="INFO", message="graph_ingest_started", context={"job_id": job_id})
            run_graph_ingest(config, run_id=run_id, job_id=job_id, actor=actor_claims)
        else:
            raise RuntimeError(f"Unknown job_type: {job_type}")
        return "success", None
    except Exception as exc:
        log_job_run_log(
            run_id=run_id,
            level="ERROR",
            message="job_exception",
            context={"job_id": job_id, "job_type": job_type, "error": str(exc)},
        )
        return "failed", str(exc)
