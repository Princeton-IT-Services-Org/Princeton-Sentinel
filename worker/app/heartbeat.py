import os
import threading
import time
from datetime import datetime, timezone

import requests


WORKER_HEARTBEAT_URL = os.getenv("WORKER_HEARTBEAT_URL", "http://web:3000/api/internal/worker-heartbeat")
WORKER_HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("WORKER_HEARTBEAT_INTERVAL_SECONDS", "30"))
WORKER_HEARTBEAT_TIMEOUT_SECONDS = int(os.getenv("WORKER_HEARTBEAT_TIMEOUT_SECONDS", "5"))
WORKER_HEARTBEAT_FAIL_THRESHOLD = int(os.getenv("WORKER_HEARTBEAT_FAIL_THRESHOLD", "2"))

_state_lock = threading.Lock()
_heartbeat_state = {
    "last_attempt_at": None,
    "last_success_at": None,
    "consecutive_failures": 0,
    "last_error": None,
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_heartbeat_healthy() -> bool:
    with _state_lock:
        return _heartbeat_state["consecutive_failures"] < WORKER_HEARTBEAT_FAIL_THRESHOLD


def get_heartbeat_status() -> dict:
    with _state_lock:
        status = dict(_heartbeat_state)
    status["webapp_reachable"] = status["consecutive_failures"] < WORKER_HEARTBEAT_FAIL_THRESHOLD
    status["interval_seconds"] = WORKER_HEARTBEAT_INTERVAL_SECONDS
    status["fail_threshold"] = WORKER_HEARTBEAT_FAIL_THRESHOLD
    return status


def start_heartbeat_thread():
    thread = threading.Thread(target=_heartbeat_loop, daemon=True)
    thread.start()


def _heartbeat_loop():
    interval_seconds = max(1, WORKER_HEARTBEAT_INTERVAL_SECONDS)
    while True:
        attempted_at = _now_iso()
        error = None
        ok = False
        try:
            resp = requests.post(
                WORKER_HEARTBEAT_URL,
                json={"sent_at": attempted_at},
                timeout=WORKER_HEARTBEAT_TIMEOUT_SECONDS,
            )
            resp.raise_for_status()
            ok = True
        except Exception as exc:
            error = str(exc)

        with _state_lock:
            _heartbeat_state["last_attempt_at"] = attempted_at
            if ok:
                _heartbeat_state["last_success_at"] = attempted_at
                _heartbeat_state["consecutive_failures"] = 0
                _heartbeat_state["last_error"] = None
            else:
                _heartbeat_state["consecutive_failures"] += 1
                _heartbeat_state["last_error"] = error

        time.sleep(interval_seconds)
