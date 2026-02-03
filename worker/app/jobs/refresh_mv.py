from typing import Dict, Any

from app import db
from app.utils import log_job_run_log


ALLOWED_MVS = {
    "mv_msgraph_inventory_summary",
    "mv_msgraph_sharing_posture_summary",
    "mv_latest_job_runs",
    "mv_msgraph_site_inventory",
    "mv_msgraph_site_sharing_summary",
}


def run_refresh_mv(config: Dict[str, Any], *, run_id: str, job_id: str):
    conn = db.get_conn()
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            """
            SELECT d.mv_name
            FROM mv_dependencies d
            LEFT JOIN mv_refresh_log r ON r.mv_name = d.mv_name
            LEFT JOIN table_update_log t ON t.table_name = d.table_name
            WHERE r.last_refreshed_at IS NULL
               OR (t.last_updated_at IS NOT NULL AND t.last_updated_at > r.last_refreshed_at)
            GROUP BY d.mv_name
            """
        )
        impacted = [row[0] for row in cur.fetchall() if row[0] in ALLOWED_MVS]

        for mv_name in impacted:
            cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {mv_name}")
            cur.execute(
                """
                INSERT INTO mv_refresh_log (mv_name, last_refreshed_at)
                VALUES (%s, now())
                ON CONFLICT (mv_name)
                DO UPDATE SET last_refreshed_at = EXCLUDED.last_refreshed_at
                """,
                [mv_name],
            )
            log_job_run_log(run_id=run_id, level="INFO", message="mv_refreshed", context={"mv_name": mv_name})

        log_job_run_log(run_id=run_id, level="INFO", message="refresh_mv_completed", context={"job_id": job_id, "impacted": impacted})
    finally:
        conn.close()
