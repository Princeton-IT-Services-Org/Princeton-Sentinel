import json
import uuid
from typing import Any, Dict, Optional

from app import db


def log_audit_event(
    action: str,
    entity_type: str,
    entity_id: str,
    actor: Optional[Dict[str, Any]],
    details: Optional[Dict[str, Any]],
):
    actor_oid = None
    actor_upn = None
    actor_name = None
    if actor:
        actor_oid = actor.get("oid") or actor.get("sub")
        actor_upn = actor.get("preferred_username") or actor.get("upn")
        actor_name = actor.get("name")

    db.execute(
        """
        INSERT INTO audit_events
          (event_id, occurred_at, actor_oid, actor_upn, actor_name, action, entity_type, entity_id, details)
        VALUES
          (%s, now(), %s, %s, %s, %s, %s, %s, %s)
        """,
        [
            str(uuid.uuid4()),
            actor_oid,
            actor_upn,
            actor_name,
            action,
            entity_type,
            entity_id,
            json.dumps(details or {}),
        ],
    )


def log_job_run_log(
    run_id: str,
    level: str,
    message: str,
    context: Optional[Dict[str, Any]] = None,
):
    db.execute(
        """
        INSERT INTO job_run_logs (run_id, level, message, context)
        VALUES (%s, %s, %s, %s)
        """,
        [
            run_id,
            level,
            message,
            json.dumps(context or {}),
        ],
    )
