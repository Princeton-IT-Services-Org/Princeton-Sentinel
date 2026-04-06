#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from deployment_lib import (  # noqa: E402
    DeploymentError,
    command_exists,
    psycopg2_available,
    stable_delimiter,
    utc_now_iso,
    write_temp_sql,
)
import subprocess  # noqa: E402


class LicenseInstallError(DeploymentError):
    pass


def load_license_text(path: Path) -> str:
    if not path.exists():
        raise LicenseInstallError(f"License file does not exist: {path}")
    return path.read_text(encoding="utf-8")


def infer_license_id(raw_license_text: str) -> str:
    delimiter = "\n---SIGNATURE---\n"
    payload = raw_license_text.split(delimiter, 1)[0]
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise LicenseInstallError(f"License payload is not valid JSON: {exc}") from exc
    license_id = str(data.get("license_id") or "").strip()
    if not license_id:
        raise LicenseInstallError("License payload is missing license_id")
    return license_id


def install_license(*, database_url: str, license_path: Path, actor_name: str = "Local deployment script") -> dict[str, str]:
    raw_license_text = load_license_text(license_path)
    sha256 = hashlib.sha256(raw_license_text.encode("utf-8")).hexdigest()
    license_id = infer_license_id(raw_license_text)
    delimiter = stable_delimiter(raw_license_text)
    actor_name_sql = stable_delimiter(actor_name)
    sql = f"""
    WITH inserted AS (
      INSERT INTO license_artifacts (
        raw_license_text,
        sha256,
        uploaded_by_oid,
        uploaded_by_upn,
        uploaded_by_name,
        verification_status,
        verification_error
      )
      VALUES (
        ${delimiter}${raw_license_text}${delimiter}$,
        '{sha256}',
        'local-deployment-script',
        'local-deployment-script@localhost',
        ${actor_name_sql}${actor_name}${actor_name_sql}$,
        'verified',
        NULL
      )
      RETURNING artifact_id
    )
    INSERT INTO active_license_artifact (slot, artifact_id, updated_at)
    SELECT 'default', artifact_id, now()
    FROM inserted
    ON CONFLICT (slot)
    DO UPDATE SET artifact_id = EXCLUDED.artifact_id, updated_at = now();
    """
    temp_sql = write_temp_sql(sql)
    try:
        execute_sql(database_url=database_url, sql_text=temp_sql.read_text(encoding="utf-8"))
    except Exception as exc:
        raise LicenseInstallError(str(exc) or "Failed to install license artifact") from exc
    finally:
        if temp_sql.exists():
            temp_sql.unlink()
    return {
        "license_id": license_id,
        "installed_at_utc": utc_now_iso(),
        "sha256": sha256,
    }


def execute_sql(*, database_url: str, sql_text: str) -> None:
    if command_exists("psql"):
        try:
            subprocess.run(
                ["psql", database_url, "-v", "ON_ERROR_STOP=1", "-c", sql_text],
                check=True,
                text=True,
                capture_output=True,
            )
            return
        except subprocess.CalledProcessError as exc:
            raise LicenseInstallError(exc.stderr.strip() or exc.stdout.strip() or "Failed to install license artifact") from exc
    if not psycopg2_available():
        raise LicenseInstallError(
            "License installation requires either `psql` or the Python package `psycopg2`.\n"
            "Install one of the following and rerun:\n"
            "- `brew install libpq` and add `psql` to your PATH\n"
            "- `python3 -m pip install psycopg2-binary`"
        )
    try:
        import psycopg2
    except ImportError as exc:  # pragma: no cover
        raise LicenseInstallError("psycopg2 is not installed.") from exc
    connection = None
    try:
        connection = psycopg2.connect(database_url)
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute(sql_text)
        connection.commit()
    except Exception as exc:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        raise LicenseInstallError(str(exc) or "Failed to install license artifact") from exc
    finally:
        if connection is not None:
            connection.close()


__all__ = ["LicenseInstallError", "install_license", "infer_license_id", "load_license_text"]
