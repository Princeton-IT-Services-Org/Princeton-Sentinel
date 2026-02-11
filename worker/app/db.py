import os
import random
from contextlib import contextmanager

import psycopg2
import psycopg2.extras


DB_URL = os.getenv("DATABASE_URL")
DB_CONNECT_TIMEOUT_SECONDS = int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "10"))
DB_WRITE_MAX_RETRIES = int(os.getenv("DB_WRITE_MAX_RETRIES", "6"))
DB_WRITE_RETRY_BASE_MS = int(os.getenv("DB_WRITE_RETRY_BASE_MS", "200"))
DB_WRITE_RETRY_MAX_MS = int(os.getenv("DB_WRITE_RETRY_MAX_MS", "3000"))
DB_WRITE_RETRY_JITTER_MS = int(os.getenv("DB_WRITE_RETRY_JITTER_MS", "150"))

RETRYABLE_DB_SQLSTATES = {"40P01", "55P03", "40001"}


def get_conn():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")
    return psycopg2.connect(DB_URL, connect_timeout=DB_CONNECT_TIMEOUT_SECONDS)


@contextmanager
def get_cursor(commit: bool = False):
    conn = get_conn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        if commit:
            conn.commit()
    finally:
        conn.close()


@contextmanager
def transaction():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_values(cur, query: str, rows: list[tuple], page_size: int = 1000):
    psycopg2.extras.execute_values(cur, query, rows, page_size=page_size)


def jsonb(value):
    return psycopg2.extras.Json(value)


def fetch_one(query, params=None):
    with get_cursor() as cur:
        cur.execute(query, params or [])
        return cur.fetchone()


def fetch_all(query, params=None):
    with get_cursor() as cur:
        cur.execute(query, params or [])
        return cur.fetchall()


def execute(query, params=None):
    with get_cursor(commit=True) as cur:
        cur.execute(query, params or [])
        return cur.rowcount


def get_db_error_sqlstate(exc: BaseException):
    pgcode = getattr(exc, "pgcode", None)
    if pgcode:
        return pgcode
    cause = getattr(exc, "__cause__", None)
    if cause is not None:
        cause_pgcode = getattr(cause, "pgcode", None)
        if cause_pgcode:
            return cause_pgcode
    return None


def is_retryable_db_error(exc: BaseException) -> bool:
    sqlstate = get_db_error_sqlstate(exc)
    return bool(sqlstate and sqlstate in RETRYABLE_DB_SQLSTATES)


def get_db_write_retry_config():
    max_retries = max(0, DB_WRITE_MAX_RETRIES)
    base_ms = max(1, DB_WRITE_RETRY_BASE_MS)
    max_ms = max(base_ms, DB_WRITE_RETRY_MAX_MS)
    jitter_ms = max(0, DB_WRITE_RETRY_JITTER_MS)
    return max_retries, base_ms, max_ms, jitter_ms


def compute_db_write_retry_sleep_seconds(attempt: int, *, base_ms: int, max_ms: int, jitter_ms: int) -> float:
    # attempt is 1-based retry attempt number.
    capped_ms = min(max_ms, base_ms * (2 ** max(0, attempt - 1)))
    jitter = random.uniform(0, jitter_ms) if jitter_ms > 0 else 0.0
    return max(0.0, (capped_ms + jitter) / 1000.0)
