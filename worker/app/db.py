import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras


DB_URL = os.getenv("DATABASE_URL")
DB_CONNECT_TIMEOUT_SECONDS = int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "10"))


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
