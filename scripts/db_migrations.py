#!/usr/bin/env python3
"""Run a single SQL migration file from db/migrations against a target Postgres DB."""

import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

try:
    import psycopg2
except ImportError:
    psycopg2 = None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Execute one SQL migration file from db/migrations in a single transaction."
    )
    parser.add_argument("sql_file", help="Path to SQL file under db/migrations")
    return parser.parse_args()


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def validate_sql_file(sql_file_arg: str, repo_root: Path) -> Path:
    migrations_dir = (repo_root / "db" / "migrations").resolve()
    candidate = Path(sql_file_arg).expanduser()
    if not candidate.is_absolute():
        candidate = (Path.cwd() / candidate).resolve()
    else:
        candidate = candidate.resolve()

    if candidate.suffix.lower() != ".sql":
        raise ValueError("Migration file must end with .sql")
    if not candidate.exists() or not candidate.is_file():
        raise ValueError(f"Migration file does not exist: {candidate}")
    try:
        candidate.relative_to(migrations_dir)
    except ValueError as exc:
        raise ValueError(
            f"Migration file must be inside {migrations_dir}, got: {candidate}"
        ) from exc
    return candidate


def read_sql_file(sql_file: Path) -> str:
    sql_text = sql_file.read_text(encoding="utf-8")
    if not sql_text.strip():
        raise ValueError(f"Migration file is empty: {sql_file}")
    return sql_text


def parse_db_host(db_url: str) -> str:
    try:
        parsed = urlparse(db_url)
    except Exception:
        return "unknown"
    return parsed.hostname or "unknown"


def prompt_db_url() -> str:
    db_url = input("Enter staging DATABASE_URL: ").strip()
    if not db_url:
        raise ValueError("DATABASE_URL cannot be empty")
    return db_url


def confirm_execution(sql_file: Path, db_host: str) -> bool:
    print(f"Migration file: {sql_file}")
    print(f"Target DB host: {db_host}")
    response = input('Type "yes" to execute this migration: ').strip().lower()
    return response == "yes"


def execute_sql(db_url: str, sql_text: str) -> None:
    if psycopg2 is None:
        raise RuntimeError(
            "psycopg2 is not installed. Install with: pip install psycopg2-binary"
        )

    conn = None
    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(sql_text)
        conn.commit()
    except Exception:
        if conn is not None:
            try:
                conn.rollback()
            except Exception as rollback_err:
                raise RuntimeError(f"Migration failed and rollback failed: {rollback_err}")
        raise
    finally:
        if conn is not None:
            conn.close()


def main() -> int:
    started_at = datetime.now(timezone.utc)
    timer_start = time.perf_counter()
    print(f"[db_migrations] Start: {started_at.isoformat()}")

    try:
        args = parse_args()
        repo_root = resolve_repo_root()
        sql_file = validate_sql_file(args.sql_file, repo_root)
        sql_text = read_sql_file(sql_file)
        db_url = prompt_db_url()
        db_host = parse_db_host(db_url)

        if not confirm_execution(sql_file, db_host):
            print("[db_migrations] Cancelled by user. No changes applied.")
            return 2

        print(f"[db_migrations] Executing: {sql_file.name}")
        execute_sql(db_url, sql_text)
        elapsed = time.perf_counter() - timer_start
        print(f"[db_migrations] Success in {elapsed:.2f}s")
        return 0
    except Exception as err:
        elapsed = time.perf_counter() - timer_start
        print(f"[db_migrations] Failed in {elapsed:.2f}s: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
