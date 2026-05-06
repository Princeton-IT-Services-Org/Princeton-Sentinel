import json
import re
import time
import hashlib
import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from app import db
from app.graph_client import GraphClient, GraphError
from app.runtime_logger import emit
from app.utils import log_job_run_log


PERIODS = ("D7", "D30", "D90", "D180", "ALL")
DEFAULT_INTERACTION_LOOKBACK_DAYS = 7
DEFAULT_INTERACTION_PAGE_SIZE = 100
DEFAULT_INTERACTION_MODE = "all_time"
STATE_KEY = "default"

APP_LABELS = {
    "copilot": "Copilot",
    "microsoft365copilot": "Copilot",
    "m365copilot": "Copilot",
    "bizchat": "Copilot",
    "word": "Word",
    "microsoftword": "Word",
    "excel": "Excel",
    "microsoftexcel": "Excel",
    "powerpoint": "PowerPoint",
    "microsoftpowerpoint": "PowerPoint",
    "outlook": "Outlook",
    "microsoftoutlook": "Outlook",
    "teams": "Teams",
    "microsoftteams": "Teams",
    "loop": "Loop",
    "microsoftloop": "Loop",
    "onenote": "OneNote",
    "microsoftonenote": "OneNote",
    "sharepoint": "SharePoint",
    "microsoftsharepoint": "SharePoint",
    "edge": "Edge",
    "microsoftedge": "Edge",
}


def run_copilot_usage_sync(*, run_id: str, job_id: str, actor=None):
    job_start = time.monotonic()
    config = _load_job_config(job_id)
    interaction_mode = _clean_str(config.get("interaction_mode") or DEFAULT_INTERACTION_MODE).lower()
    all_time_interactions = interaction_mode in {"all_time", "all-time", "all"}
    lookback_days = _positive_int(config.get("interaction_lookback_days"), DEFAULT_INTERACTION_LOOKBACK_DAYS)
    page_size = _positive_int(config.get("interaction_page_size"), DEFAULT_INTERACTION_PAGE_SIZE)
    max_users = max(0, _positive_int(config.get("interaction_max_users"), 0))

    interaction_window_end = datetime.now(timezone.utc)
    interaction_window_start = None if all_time_interactions else interaction_window_end - timedelta(days=lookback_days)

    log_job_run_log(
        run_id=run_id,
        level="INFO",
        message="copilot_usage_sync_started",
        context={
            "job_id": job_id,
            "periods": list(PERIODS),
            "interaction_mode": "all_time" if all_time_interactions else "window",
            "interaction_window_start": _format_graph_dt(interaction_window_start) if interaction_window_start else None,
            "interaction_window_end": _format_graph_dt(interaction_window_end),
        },
    )

    client = GraphClient()

    summary_rows: list[dict[str, Any]] = []
    trend_rows: list[dict[str, Any]] = []
    user_detail_rows: list[dict[str, Any]] = []
    d7_active_rows: list[dict[str, Any]] = []

    for period in PERIODS:
        summaries = _fetch_report_rows(client, "getMicrosoft365CopilotUserCountSummary", period)
        trends = _fetch_report_rows(client, "getMicrosoft365CopilotUserCountTrend", period)
        users = _fetch_report_rows(client, "getMicrosoft365CopilotUsageUserDetail", period)

        summary_rows.extend(_normalize_summary_rows(period, summaries))
        trend_rows.extend(_normalize_trend_rows(period, trends))
        normalized_users = _normalize_user_detail_rows(period, users)
        user_detail_rows.extend(normalized_users)
        if period == "D7":
            d7_active_rows = [row for row in normalized_users if row.get("last_activity_date")]

    _upsert_report_data(summary_rows, trend_rows, user_detail_rows)

    users_to_process = d7_active_rows[:max_users] if max_users > 0 else d7_active_rows
    resolved_users: list[dict[str, Any]] = []
    unresolved_users = 0
    for user_row in users_to_process:
        resolved = _resolve_user(client, user_row)
        if resolved:
            resolved_users.append({**user_row, **resolved})
        else:
            unresolved_users += 1

    aggregate_map: dict[tuple, dict[str, Any]] = {}
    prompt_count = 0
    for user_row in resolved_users:
        interactions = _fetch_enterprise_interactions(
            client,
            user_id=user_row["entra_user_id"],
            window_start=interaction_window_start,
            window_end=interaction_window_end,
            page_size=page_size,
        )
        user_prompt_count = _aggregate_user_prompts(aggregate_map, user_row, interactions)
        prompt_count += user_prompt_count

    _replace_interaction_aggregates(
        list(aggregate_map.values()),
        user_ids=[row["entra_user_id"] for row in resolved_users],
        all_time=all_time_interactions,
        window_start=interaction_window_start,
        window_end=interaction_window_end,
    )
    _upsert_sync_state(
        d7_active_users=len(d7_active_rows),
        resolved_users=len(resolved_users),
        unresolved_users=unresolved_users,
        prompt_count=prompt_count,
        window_start=interaction_window_start,
        window_end=interaction_window_end,
    )

    log_job_run_log(
        run_id=run_id,
        level="INFO",
        message="copilot_usage_sync_completed",
        context={
            "job_id": job_id,
            "duration_sec": round(time.monotonic() - job_start, 2),
            "interaction_mode": "all_time" if all_time_interactions else "window",
            "summary_rows": len(summary_rows),
            "trend_rows": len(trend_rows),
            "user_detail_rows": len(user_detail_rows),
            "d7_active_users": len(d7_active_rows),
            "resolved_users": len(resolved_users),
            "unresolved_users": unresolved_users,
            "interaction_aggregate_rows": len(aggregate_map),
            "prompt_count": prompt_count,
        },
    )


def _load_job_config(job_id: str) -> dict[str, Any]:
    try:
        row = db.fetch_one("SELECT config FROM jobs WHERE job_id = %s", [job_id])
    except Exception:
        return {}
    raw = row.get("config") if row else None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _positive_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _fetch_report_rows(client: GraphClient, report_name: str, period: str) -> list[dict[str, Any]]:
    path = f"/copilot/reports/{report_name}(period='{period}')"
    text = client.get_text(path)
    csv_rows = _parse_report_csv(text)
    if csv_rows:
        return csv_rows

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    value = data.get("value") if isinstance(data, dict) else None
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict):
        return [value]
    if isinstance(data, dict):
        return [data]
    return []


def _parse_report_csv(text: str) -> list[dict[str, Any]]:
    normalized = (text or "").lstrip("\ufeff").strip()
    if not normalized:
        return []
    reader = csv.DictReader(io.StringIO(normalized))
    if not reader.fieldnames:
        return []
    return [dict(row) for row in reader]


def _normalize_summary_rows(period: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return [
            {
                "source_period": period,
                "report_refresh_date": None,
                "report_period": None,
                "enabled_users": 0,
                "active_users": 0,
                "raw_json": {},
            }
        ]
    out: list[dict[str, Any]] = []
    for row in rows:
        product = _select_period_child(row.get("adoptionByProduct"), period) or row
        out.append(
            {
                "source_period": period,
                "report_refresh_date": _parse_date(_pick(row, "reportRefreshDate", "Report Refresh Date")),
                "report_period": _parse_int(_pick(product, "reportPeriod", "Report Period")),
                "enabled_users": _parse_int(
                    _pick(
                        product,
                        "anyAppEnabledUsers",
                        "enabledUserCount",
                        "microsoft365CopilotEnabledUserCount",
                        "Any App Enabled Users",
                        "Microsoft 365 Copilot Enabled Users",
                        "Enabled Users",
                    )
                ),
                "active_users": _parse_int(
                    _pick(
                        product,
                        "anyAppActiveUsers",
                        "activeUserCount",
                        "microsoft365CopilotActiveUserCount",
                        "Any App Active Users",
                        "Microsoft 365 Copilot Active Users",
                        "Active Users",
                    )
                ),
                "raw_json": row,
            }
        )
    if not out:
        return out
    return [max(out, key=lambda item: int(item.get("report_period") or 0))]


def _normalize_trend_rows(period: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        date_rows = row.get("adoptionByDate") if isinstance(row.get("adoptionByDate"), list) else [row]
        for date_row in date_rows:
            if not isinstance(date_row, dict):
                continue
            report_date = _parse_date(_pick(date_row, "reportDate", "date", "Date", "Report Date"))
            if not report_date:
                continue
            out.append(
                {
                    "source_period": period,
                    "report_date": report_date,
                    "report_period": _parse_int(_pick(date_row, "reportPeriod", "Report Period")) or _parse_period_days(period),
                    "enabled_users": _parse_int(
                        _pick(
                            date_row,
                            "anyAppEnabledUsers",
                            "enabledUserCount",
                            "microsoft365CopilotEnabledUserCount",
                            "Any App Enabled Users",
                            "Microsoft 365 Copilot Enabled Users",
                            "Enabled Users",
                        )
                    ),
                    "active_users": _parse_int(
                        _pick(
                            date_row,
                            "anyAppActiveUsers",
                            "activeUserCount",
                            "microsoft365CopilotActiveUserCount",
                            "Any App Active Users",
                            "Microsoft 365 Copilot Active Users",
                            "Active Users",
                        )
                    ),
                    "raw_json": row,
                }
            )
    by_date: dict[date, dict[str, Any]] = {}
    for item in out:
        existing = by_date.get(item["report_date"])
        if not existing or int(item.get("report_period") or 0) >= int(existing.get("report_period") or 0):
            by_date[item["report_date"]] = item
    return list(by_date.values())


def _normalize_user_detail_rows(period: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        period_detail = _select_period_child(row.get("copilotActivityUserDetailsByPeriod"), period) or {}
        upn = _clean_str(_pick(row, "userPrincipalName", "User Principal Name", "email", "Email"))
        display_name = _clean_str(_pick(row, "displayName", "Display Name"))
        user_id = _clean_str(_pick(row, "id", "userId", "User Id"))
        report_user_key = upn or user_id or display_name or _stable_row_key(row)
        last_activity = _parse_date(_pick(row, "lastActivityDate", "Last Activity Date"))
        out.append(
            {
                "source_period": period,
                "report_user_key": report_user_key,
                "entra_user_id": user_id,
                "user_principal_name": upn,
                "display_name": display_name,
                "department": _clean_str(_pick(row, "department", "Department")),
                "office_location": _clean_str(_pick(row, "officeLocation", "Office Location")),
                "last_activity_date": last_activity,
                "report_refresh_date": _parse_date(_pick(row, "reportRefreshDate", "Report Refresh Date")),
                "report_period": _parse_int(_pick(period_detail, "reportPeriod", "Report Period")) or _parse_period_days(period),
                "enabled_for_copilot": _parse_bool(_pick(row, "isEnabled", "assignedProducts", "Enabled")),
                "active_in_period": bool(last_activity),
                "raw_json": row,
            }
        )
    return _dedupe_user_detail_rows(out)


def _dedupe_user_detail_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    duplicate_count = 0
    for row in rows:
        key = (row["source_period"], row["report_user_key"])
        existing = by_key.get(key)
        if existing is None:
            by_key[key] = dict(row)
            continue
        duplicate_count += 1
        by_key[key] = _merge_user_detail_row(existing, row)
    if duplicate_count:
        emit("WARN", "COPILOT_USAGE_SYNC", f"Deduplicated Copilot user detail rows: duplicates={duplicate_count}")
    return list(by_key.values())


def _merge_user_detail_row(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    winner, other = (right, left) if _user_detail_row_score(right) > _user_detail_row_score(left) else (left, right)
    merged = dict(winner)
    for field in ("entra_user_id", "user_principal_name", "display_name", "department", "office_location"):
        if not merged.get(field) and other.get(field):
            merged[field] = other[field]
    for field in ("last_activity_date", "report_refresh_date"):
        left_value = left.get(field)
        right_value = right.get(field)
        if left_value and right_value:
            merged[field] = max(left_value, right_value)
        else:
            merged[field] = left_value or right_value
    merged["report_period"] = max(int(left.get("report_period") or 0), int(right.get("report_period") or 0))
    if left.get("enabled_for_copilot") is True or right.get("enabled_for_copilot") is True:
        merged["enabled_for_copilot"] = True
    elif left.get("enabled_for_copilot") is False or right.get("enabled_for_copilot") is False:
        merged["enabled_for_copilot"] = False
    else:
        merged["enabled_for_copilot"] = None
    merged["active_in_period"] = bool(left.get("active_in_period") or right.get("active_in_period"))
    return merged


def _user_detail_row_score(row: dict[str, Any]) -> tuple:
    identity_fields = ("entra_user_id", "user_principal_name", "display_name", "department", "office_location")
    return (
        1 if row.get("active_in_period") else 0,
        row.get("last_activity_date") or date.min,
        row.get("report_refresh_date") or date.min,
        int(row.get("report_period") or 0),
        sum(1 for field in identity_fields if row.get(field)),
    )


def _select_period_child(value: Any, period: str) -> dict[str, Any] | None:
    if not isinstance(value, list):
        return None
    children = [item for item in value if isinstance(item, dict)]
    if not children:
        return None
    target_days = _parse_period_days(period)
    if target_days:
        for child in children:
            if _parse_int(_pick(child, "reportPeriod", "Report Period")) == target_days:
                return child
    return max(children, key=lambda child: _parse_int(_pick(child, "reportPeriod", "Report Period")))


def _parse_period_days(period: str) -> int:
    if period.startswith("D"):
        return _parse_int(period[1:])
    return 0


def _stable_row_key(row: dict[str, Any]) -> str:
    payload = json.dumps(row, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _upsert_report_data(summary_rows: list[dict[str, Any]], trend_rows: list[dict[str, Any]], user_detail_rows: list[dict[str, Any]]):
    user_detail_rows = _dedupe_user_detail_rows(user_detail_rows)
    conn = db.get_conn()
    try:
        cur = conn.cursor()
        if summary_rows:
            db.execute_values(
                cur,
                """
                INSERT INTO m365_copilot_user_count_summary
                  (source_period, report_refresh_date, report_period, enabled_users, active_users, raw_json)
                VALUES %s
                ON CONFLICT (source_period) DO UPDATE SET
                  report_refresh_date = EXCLUDED.report_refresh_date,
                  report_period = EXCLUDED.report_period,
                  enabled_users = EXCLUDED.enabled_users,
                  active_users = EXCLUDED.active_users,
                  raw_json = EXCLUDED.raw_json,
                  synced_at = now()
                """,
                [
                    (
                        row["source_period"],
                        row["report_refresh_date"],
                        row["report_period"],
                        row["enabled_users"],
                        row["active_users"],
                        db.jsonb(row["raw_json"]),
                    )
                    for row in summary_rows
                ],
            )
        if trend_rows:
            db.execute_values(
                cur,
                """
                INSERT INTO m365_copilot_user_count_trend
                  (source_period, report_date, report_period, enabled_users, active_users, raw_json)
                VALUES %s
                ON CONFLICT (source_period, report_date) DO UPDATE SET
                  report_period = EXCLUDED.report_period,
                  enabled_users = EXCLUDED.enabled_users,
                  active_users = EXCLUDED.active_users,
                  raw_json = EXCLUDED.raw_json,
                  synced_at = now()
                """,
                [
                    (
                        row["source_period"],
                        row["report_date"],
                        row["report_period"],
                        row["enabled_users"],
                        row["active_users"],
                        db.jsonb(row["raw_json"]),
                    )
                    for row in trend_rows
                ],
            )
        if user_detail_rows:
            db.execute_values(
                cur,
                """
                INSERT INTO m365_copilot_usage_user_detail
                  (source_period, report_user_key, entra_user_id, user_principal_name, display_name,
                   department, office_location, last_activity_date, report_refresh_date, report_period,
                   enabled_for_copilot, active_in_period, raw_json)
                VALUES %s
                ON CONFLICT (source_period, report_user_key) DO UPDATE SET
                  entra_user_id = COALESCE(EXCLUDED.entra_user_id, m365_copilot_usage_user_detail.entra_user_id),
                  user_principal_name = EXCLUDED.user_principal_name,
                  display_name = EXCLUDED.display_name,
                  department = EXCLUDED.department,
                  office_location = EXCLUDED.office_location,
                  last_activity_date = EXCLUDED.last_activity_date,
                  report_refresh_date = EXCLUDED.report_refresh_date,
                  report_period = EXCLUDED.report_period,
                  enabled_for_copilot = EXCLUDED.enabled_for_copilot,
                  active_in_period = EXCLUDED.active_in_period,
                  raw_json = EXCLUDED.raw_json,
                  synced_at = now()
                """,
                [
                    (
                        row["source_period"],
                        row["report_user_key"],
                        row["entra_user_id"],
                        row["user_principal_name"],
                        row["display_name"],
                        row["department"],
                        row["office_location"],
                        row["last_activity_date"],
                        row["report_refresh_date"],
                        row["report_period"],
                        row["enabled_for_copilot"],
                        row["active_in_period"],
                        db.jsonb(row["raw_json"]),
                    )
                    for row in user_detail_rows
                ],
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _resolve_user(client: GraphClient, user_row: dict[str, Any]) -> dict[str, Any] | None:
    local = _resolve_user_from_db(user_row)
    if local:
        return local

    lookup = user_row.get("user_principal_name") or user_row.get("entra_user_id")
    if not lookup or _looks_anonymized(str(lookup)):
        return None

    select = "id,displayName,userPrincipalName,mail,department,officeLocation"
    try:
        graph_user = client.get_json(f"/users/{quote(str(lookup), safe='')}?$select={select}")
    except GraphError as exc:
        if exc.status_code in (400, 403, 404):
            emit("WARN", "COPILOT_USAGE_SYNC", f"Unable to resolve Copilot report user: user={lookup} status={exc.status_code}")
            return None
        raise

    entra_user_id = _clean_str(graph_user.get("id"))
    if not entra_user_id:
        return None
    return {
        "entra_user_id": entra_user_id,
        "user_principal_name": _clean_str(graph_user.get("userPrincipalName")) or user_row.get("user_principal_name") or "",
        "display_name": _clean_str(graph_user.get("displayName")) or user_row.get("display_name") or "",
        "department": _clean_str(graph_user.get("department")) or user_row.get("department") or "",
        "office_location": _clean_str(graph_user.get("officeLocation")) or user_row.get("office_location") or "",
    }


def _resolve_user_from_db(user_row: dict[str, Any]) -> dict[str, Any] | None:
    entra_user_id = user_row.get("entra_user_id")
    upn = user_row.get("user_principal_name")
    if entra_user_id:
        row = db.fetch_one(
            """
            SELECT id, display_name, user_principal_name, mail, department, office_location
            FROM msgraph_users
            WHERE id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            [entra_user_id],
        )
        if row:
            return _db_user_to_resolved(row, user_row)
    if upn and not _looks_anonymized(str(upn)):
        row = db.fetch_one(
            """
            SELECT id, display_name, user_principal_name, mail, department, office_location
            FROM msgraph_users
            WHERE deleted_at IS NULL
              AND (lower(user_principal_name) = lower(%s) OR lower(mail) = lower(%s))
            LIMIT 1
            """,
            [upn, upn],
        )
        if row:
            return _db_user_to_resolved(row, user_row)
    return None


def _db_user_to_resolved(row: dict[str, Any], user_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "entra_user_id": row.get("id"),
        "user_principal_name": row.get("user_principal_name") or row.get("mail") or user_row.get("user_principal_name") or "",
        "display_name": row.get("display_name") or user_row.get("display_name") or "",
        "department": row.get("department") or user_row.get("department") or "",
        "office_location": row.get("office_location") or user_row.get("office_location") or "",
    }


def _fetch_enterprise_interactions(
    client: GraphClient,
    *,
    user_id: str,
    window_start: datetime | None,
    window_end: datetime,
    page_size: int,
) -> list[dict[str, Any]]:
    path = f"/copilot/users/{quote(user_id, safe='')}/interactionHistory/getAllEnterpriseInteractions?$top={page_size}"
    if window_start is not None:
        filter_value = (
            f"createdDateTime gt {_format_graph_dt(window_start)} "
            f"and createdDateTime lt {_format_graph_dt(window_end)}"
        )
        path += f"&$filter={quote(filter_value, safe=':')}"
    try:
        return client.collect_paged(path)
    except GraphError as exc:
        if exc.status_code in (400, 403, 404):
            emit("WARN", "COPILOT_USAGE_SYNC", f"Interaction export skipped for user={user_id} status={exc.status_code}")
            return []
        raise


def _aggregate_user_prompts(aggregate_map: dict[tuple, dict[str, Any]], user_row: dict[str, Any], interactions: list[dict[str, Any]]) -> int:
    prompt_count = 0
    request_ids_by_key: dict[tuple, set[str]] = defaultdict(set)
    session_ids_by_key: dict[tuple, set[str]] = defaultdict(set)

    for interaction in interactions:
        if str(interaction.get("interactionType") or "").lower() != "userprompt":
            continue
        created_at = _parse_datetime(interaction.get("createdDateTime"))
        if not created_at:
            continue
        bucket = created_at.replace(minute=0, second=0, microsecond=0)
        app_class = _clean_str(_pick(interaction, "appClass", "app", "application", "applicationName"))
        source_app = normalize_source_app(app_class or _clean_str(_pick(interaction, "sourceApp", "clientApp")))
        conversation_type = _clean_str(_pick(interaction, "conversationType", "threadType"))
        context_type = _extract_context_type(interaction)
        locale = _clean_str(_pick(interaction, "locale", "language"))
        key = (
            bucket,
            user_row["entra_user_id"],
            source_app,
            app_class or "",
            conversation_type or "",
            context_type or "",
            locale or "",
        )
        if key not in aggregate_map:
            aggregate_map[key] = {
                "bucket_start_utc": bucket,
                "entra_user_id": user_row["entra_user_id"],
                "user_principal_name": user_row.get("user_principal_name") or "",
                "display_name": user_row.get("display_name") or "",
                "department": user_row.get("department") or "",
                "office_location": user_row.get("office_location") or "",
                "source_app": source_app,
                "app_class": app_class or "",
                "conversation_type": conversation_type or "",
                "context_type": context_type or "",
                "locale": locale or "",
                "prompt_count": 0,
                "request_count": 0,
                "session_count": 0,
            }
        aggregate_map[key]["prompt_count"] += 1
        prompt_count += 1

        request_id = _clean_str(_pick(interaction, "requestId", "id", "interactionId"))
        session_id = _clean_str(_pick(interaction, "sessionId", "conversationId", "threadId"))
        if request_id:
            request_ids_by_key[key].add(request_id)
        if session_id:
            session_ids_by_key[key].add(session_id)

    for key, row in aggregate_map.items():
        if key in request_ids_by_key:
            row["request_count"] = max(row["request_count"], len(request_ids_by_key[key]))
        elif row["request_count"] == 0:
            row["request_count"] = row["prompt_count"]
        if key in session_ids_by_key:
            row["session_count"] = max(row["session_count"], len(session_ids_by_key[key]))
        elif row["session_count"] == 0 and row["prompt_count"] > 0:
            row["session_count"] = 1
    return prompt_count


def _replace_interaction_aggregates(
    rows: list[dict[str, Any]],
    *,
    user_ids: list[str],
    all_time: bool,
    window_start: datetime | None,
    window_end: datetime,
):
    conn = db.get_conn()
    try:
        cur = conn.cursor()
        if all_time:
            if user_ids:
                cur.execute(
                    """
                    DELETE FROM m365_copilot_interaction_aggregates
                    WHERE entra_user_id = ANY(%s)
                    """,
                    [user_ids],
                )
        elif window_start is not None:
            cur.execute(
                """
                DELETE FROM m365_copilot_interaction_aggregates
                WHERE bucket_start_utc >= date_trunc('hour', %s::timestamptz)
                  AND bucket_start_utc < %s::timestamptz
                """,
                [window_start, window_end],
            )
        if rows:
            db.execute_values(
                cur,
                """
                INSERT INTO m365_copilot_interaction_aggregates
                  (bucket_start_utc, entra_user_id, user_principal_name, display_name, department, office_location,
                   source_app, app_class, conversation_type, context_type, locale,
                   prompt_count, request_count, session_count)
                VALUES %s
                ON CONFLICT (
                  bucket_start_utc, entra_user_id, source_app, app_class, conversation_type, context_type, locale
                ) DO UPDATE SET
                  prompt_count = EXCLUDED.prompt_count,
                  request_count = EXCLUDED.request_count,
                  session_count = EXCLUDED.session_count,
                  user_principal_name = EXCLUDED.user_principal_name,
                  display_name = EXCLUDED.display_name,
                  department = EXCLUDED.department,
                  office_location = EXCLUDED.office_location,
                  synced_at = now()
                """,
                [
                    (
                        row["bucket_start_utc"],
                        row["entra_user_id"],
                        row["user_principal_name"],
                        row["display_name"],
                        row["department"],
                        row["office_location"],
                        row["source_app"],
                        row["app_class"],
                        row["conversation_type"],
                        row["context_type"],
                        row["locale"],
                        row["prompt_count"],
                        row["request_count"],
                        row["session_count"],
                    )
                    for row in rows
                ],
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _upsert_sync_state(
    *,
    d7_active_users: int,
    resolved_users: int,
    unresolved_users: int,
    prompt_count: int,
    window_start: datetime,
    window_end: datetime,
):
    db.execute(
        """
        INSERT INTO m365_copilot_usage_sync_state
          (state_key, last_success_at, last_reports_synced_at, last_interactions_synced_at,
           interaction_window_start, interaction_window_end, d7_active_users,
           resolved_users, unresolved_users, prompt_count, updated_at)
        VALUES (%s, now(), now(), now(), %s, %s, %s, %s, %s, %s, now())
        ON CONFLICT (state_key) DO UPDATE SET
          last_success_at = EXCLUDED.last_success_at,
          last_reports_synced_at = EXCLUDED.last_reports_synced_at,
          last_interactions_synced_at = EXCLUDED.last_interactions_synced_at,
          interaction_window_start = EXCLUDED.interaction_window_start,
          interaction_window_end = EXCLUDED.interaction_window_end,
          d7_active_users = EXCLUDED.d7_active_users,
          resolved_users = EXCLUDED.resolved_users,
          unresolved_users = EXCLUDED.unresolved_users,
          prompt_count = EXCLUDED.prompt_count,
          updated_at = now()
        """,
        [STATE_KEY, window_start, window_end, d7_active_users, resolved_users, unresolved_users, prompt_count],
    )


def normalize_source_app(value: Any) -> str:
    text = _clean_str(value)
    if not text:
        return "Unknown"
    normalized = re.sub(r"[^a-z0-9]", "", text.lower())
    return APP_LABELS.get(normalized, text[:80])


def _extract_context_type(interaction: dict[str, Any]) -> str:
    context = interaction.get("contexts") or interaction.get("context")
    if isinstance(context, list) and context:
        first = context[0]
        if isinstance(first, dict):
            return _clean_str(_pick(first, "contextType", "type", "@odata.type"))
    if isinstance(context, dict):
        return _clean_str(_pick(context, "contextType", "type", "@odata.type"))
    return _clean_str(_pick(interaction, "contextType"))


def _pick(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in row:
            return row.get(name)
    lower_map = {str(key).lower(): key for key in row.keys()}
    for name in names:
        key = lower_map.get(name.lower())
        if key is not None:
            return row.get(key)
    return None


def _clean_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _parse_date(value: Any) -> date | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _parse_int(value: Any) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(float(str(value).replace(",", "")))
    except ValueError:
        return 0


def _parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"1", "true", "t", "yes", "y", "enabled"}:
        return True
    if text in {"0", "false", "f", "no", "n", "disabled"}:
        return False
    return None


def _looks_anonymized(value: str) -> bool:
    text = value.strip()
    return "@" not in text and bool(re.fullmatch(r"[a-fA-F0-9-]{16,}", text))


def _format_graph_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
