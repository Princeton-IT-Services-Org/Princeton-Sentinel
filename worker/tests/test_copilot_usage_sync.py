import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.jobs import copilot_usage_sync


class FakeGraphClient:
    def __init__(self):
        self.paths = []

    def collect_paged(self, path):
        self.paths.append(path)
        if "getMicrosoft365CopilotUserCountSummary" in path:
            return [
                {
                    "reportRefreshDate": "2026-05-01",
                    "adoptionByProduct": [
                        {
                            "reportPeriod": 7,
                            "anyAppEnabledUsers": 10,
                            "anyAppActiveUsers": 5,
                        }
                    ],
                }
            ]
        if "getMicrosoft365CopilotUserCountTrend" in path:
            return [
                {
                    "adoptionByDate": [
                        {
                            "reportDate": "2026-05-01",
                            "reportPeriod": 7,
                            "anyAppEnabledUsers": 10,
                            "anyAppActiveUsers": 5,
                        }
                    ],
                }
            ]
        if "getMicrosoft365CopilotUsageUserDetail" in path:
            period = "D7" if "period='D7'" in path else "D30"
            return [
                {
                    "userPrincipalName": "ada@example.edu",
                    "displayName": "Ada Lovelace",
                    "lastActivityDate": "2026-05-01" if period == "D7" else None,
                    "department": "Engineering",
                    "officeLocation": "Princeton",
                    "copilotActivityUserDetailsByPeriod": [{"reportPeriod": 7}],
                }
            ]
        if "getAllEnterpriseInteractions" in path:
            return [
                {
                    "id": "prompt-1",
                    "sessionId": "session-1",
                    "interactionType": "userPrompt",
                    "createdDateTime": "2026-05-01T12:15:00Z",
                    "appClass": "microsoftWord",
                    "body": {"content": "do not persist"},
                },
                {
                    "id": "response-1",
                    "sessionId": "session-1",
                    "interactionType": "aiResponse",
                    "createdDateTime": "2026-05-01T12:15:10Z",
                    "appClass": "microsoftWord",
                },
                {
                    "id": "prompt-2",
                    "sessionId": "session-2",
                    "interactionType": "userPrompt",
                    "createdDateTime": "2026-05-01T13:05:00Z",
                    "appClass": "microsoftTeams",
                },
            ]
        return []

    def get_text(self, path):
        self.paths.append(path)
        if "getMicrosoft365CopilotUserCountSummary" in path:
            return "Report Refresh Date,Report Period,Any App Enabled Users,Any App Active Users\n2026-05-01,7,10,5\n"
        if "getMicrosoft365CopilotUserCountTrend" in path:
            return "Report Date,Report Period,Any App Enabled Users,Any App Active Users\n2026-05-01,7,10,5\n"
        if "getMicrosoft365CopilotUsageUserDetail" in path:
            last_activity = "2026-05-01" if "period='D7'" in path else ""
            return (
                "User Principal Name,Display Name,Last Activity Date,Department,Office Location,Report Period\n"
                f"ada@example.edu,Ada Lovelace,{last_activity},Engineering,Princeton,7\n"
            )
        return ""


class CopilotUsageSyncTests(unittest.TestCase):
    def test_user_detail_normalization_deduplicates_same_user_within_period(self):
        rows = copilot_usage_sync._normalize_user_detail_rows(
            "D7",
            [
                {
                    "userPrincipalName": "ada@example.edu",
                    "displayName": "Ada Lovelace",
                    "lastActivityDate": "",
                    "department": "",
                    "officeLocation": "Princeton",
                    "copilotActivityUserDetailsByPeriod": [{"reportPeriod": 7}],
                },
                {
                    "userPrincipalName": "ada@example.edu",
                    "displayName": "Ada Lovelace",
                    "lastActivityDate": "2026-05-02",
                    "department": "Engineering",
                    "officeLocation": "",
                    "copilotActivityUserDetailsByPeriod": [{"reportPeriod": 7}],
                },
            ],
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source_period"], "D7")
        self.assertEqual(rows[0]["report_user_key"], "ada@example.edu")
        self.assertEqual(rows[0]["last_activity_date"], date(2026, 5, 2))
        self.assertEqual(rows[0]["department"], "Engineering")
        self.assertEqual(rows[0]["office_location"], "Princeton")
        self.assertTrue(rows[0]["active_in_period"])

    @patch("app.jobs.copilot_usage_sync.db.execute_values")
    @patch("app.jobs.copilot_usage_sync.db.get_conn")
    def test_report_upserts_do_not_list_default_synced_at_in_insert_columns(self, mock_get_conn, mock_execute_values):
        class FakeConn:
            def cursor(self):
                return object()

            def commit(self):
                pass

            def rollback(self):
                pass

            def close(self):
                pass

        mock_get_conn.return_value = FakeConn()

        copilot_usage_sync._upsert_report_data(
            [
                {
                    "source_period": "D7",
                    "report_refresh_date": date(2026, 5, 2),
                    "report_period": 7,
                    "enabled_users": 13,
                    "active_users": 10,
                    "raw_json": {"Report Period": "7"},
                }
            ],
            [
                {
                    "source_period": "D7",
                    "report_date": date(2026, 5, 2),
                    "report_period": 7,
                    "enabled_users": 13,
                    "active_users": 10,
                    "raw_json": {"Report Date": "2026-05-02"},
                }
            ],
            [
                {
                    "source_period": "D7",
                    "report_user_key": "ada@example.edu",
                    "entra_user_id": "user-1",
                    "user_principal_name": "ada@example.edu",
                    "display_name": "Ada Lovelace",
                    "department": "Engineering",
                    "office_location": "Princeton",
                    "last_activity_date": date(2026, 5, 2),
                    "report_refresh_date": date(2026, 5, 2),
                    "report_period": 7,
                    "enabled_for_copilot": True,
                    "active_in_period": True,
                    "raw_json": {"User Principal Name": "ada@example.edu"},
                }
            ],
        )

        self.assertEqual(mock_execute_values.call_count, 3)
        for call in mock_execute_values.call_args_list:
            query = call.args[1]
            insert_columns = query.split("VALUES %s", 1)[0]
            self.assertNotIn("synced_at", insert_columns)
            self.assertIn("synced_at = now()", query)

    @patch("app.jobs.copilot_usage_sync.db.execute_values")
    @patch("app.jobs.copilot_usage_sync.db.get_conn")
    def test_interaction_upsert_does_not_list_default_synced_at_in_insert_columns(self, mock_get_conn, mock_execute_values):
        class FakeCursor:
            def execute(self, *_args, **_kwargs):
                pass

        class FakeConn:
            def cursor(self):
                return FakeCursor()

            def commit(self):
                pass

            def rollback(self):
                pass

            def close(self):
                pass

        mock_get_conn.return_value = FakeConn()

        copilot_usage_sync._replace_interaction_aggregates(
            [
                {
                    "bucket_start_utc": datetime(2026, 5, 2, 12, tzinfo=timezone.utc),
                    "entra_user_id": "user-1",
                    "user_principal_name": "ada@example.edu",
                    "display_name": "Ada Lovelace",
                    "department": "Engineering",
                    "office_location": "Princeton",
                    "source_app": "Word",
                    "app_class": "microsoftWord",
                    "conversation_type": "",
                    "context_type": "",
                    "locale": "en-US",
                    "prompt_count": 1,
                    "request_count": 1,
                    "session_count": 1,
                }
            ],
            user_ids=["user-1"],
            all_time=True,
            window_start=None,
            window_end=datetime(2026, 5, 2, 13, tzinfo=timezone.utc),
        )

        query = mock_execute_values.call_args.args[1]
        insert_columns = query.split("VALUES %s", 1)[0]
        self.assertNotIn("synced_at", insert_columns)
        self.assertIn("synced_at = now()", query)

    @patch("app.jobs.copilot_usage_sync.log_job_run_log")
    @patch("app.jobs.copilot_usage_sync._upsert_sync_state")
    @patch("app.jobs.copilot_usage_sync._replace_interaction_aggregates")
    @patch("app.jobs.copilot_usage_sync._upsert_report_data")
    @patch("app.jobs.copilot_usage_sync._resolve_user")
    @patch("app.jobs.copilot_usage_sync.GraphClient")
    @patch("app.jobs.copilot_usage_sync._load_job_config", return_value={"interaction_mode": "all_time", "interaction_page_size": 100})
    def test_run_fetches_reports_in_order_and_aggregates_user_prompts_by_app(
        self,
        _mock_config,
        mock_graph_client_class,
        mock_resolve_user,
        _mock_upsert_reports,
        mock_replace_interactions,
        mock_upsert_state,
        _mock_log,
    ):
        fake_client = FakeGraphClient()
        mock_graph_client_class.return_value = fake_client
        mock_resolve_user.return_value = {
            "entra_user_id": "user-1",
            "user_principal_name": "ada@example.edu",
            "display_name": "Ada Lovelace",
            "department": "Engineering",
            "office_location": "Princeton",
        }

        copilot_usage_sync.run_copilot_usage_sync(run_id="run-1", job_id="job-1")

        report_paths = [path for path in fake_client.paths if path.startswith("/copilot/reports/")]
        expected = []
        for period in copilot_usage_sync.PERIODS:
            expected.extend(
                [
                    f"/copilot/reports/getMicrosoft365CopilotUserCountSummary(period='{period}')",
                    f"/copilot/reports/getMicrosoft365CopilotUserCountTrend(period='{period}')",
                    f"/copilot/reports/getMicrosoft365CopilotUsageUserDetail(period='{period}')",
                ]
            )
        self.assertEqual(report_paths, expected)

        rows = mock_replace_interactions.call_args.args[0]
        prompts_by_app = {row["source_app"]: row["prompt_count"] for row in rows}
        self.assertEqual(prompts_by_app, {"Word": 1, "Teams": 1})
        self.assertTrue(all("body" not in row and "content" not in row for row in rows))
        self.assertTrue(mock_replace_interactions.call_args.kwargs["all_time"])
        self.assertEqual(mock_replace_interactions.call_args.kwargs["user_ids"], ["user-1"])
        interaction_paths = [path for path in fake_client.paths if "getAllEnterpriseInteractions" in path]
        self.assertTrue(interaction_paths)
        self.assertNotIn("$filter=", interaction_paths[0])
        mock_upsert_state.assert_called_once()
        self.assertEqual(mock_upsert_state.call_args.kwargs["prompt_count"], 2)

    def test_windowed_interaction_mode_keeps_created_datetime_filter(self):
        client = FakeGraphClient()

        copilot_usage_sync._fetch_enterprise_interactions(
            client,
            user_id="user-1",
            window_start=copilot_usage_sync._parse_datetime("2026-05-01T00:00:00Z"),
            window_end=copilot_usage_sync._parse_datetime("2026-05-02T00:00:00Z"),
            page_size=100,
        )

        path = [path for path in client.paths if "getAllEnterpriseInteractions" in path][0]
        self.assertIn("$filter=", path)
        self.assertIn("createdDateTime", path)

    def test_normalize_source_app_maps_known_apps_and_falls_back(self):
        self.assertEqual(copilot_usage_sync.normalize_source_app("microsoftPowerPoint"), "PowerPoint")
        self.assertEqual(copilot_usage_sync.normalize_source_app("customSurface"), "customSurface")
        self.assertEqual(copilot_usage_sync.normalize_source_app(""), "Unknown")


if __name__ == "__main__":
    unittest.main()
