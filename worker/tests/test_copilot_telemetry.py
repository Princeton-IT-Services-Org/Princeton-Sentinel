import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.jobs import copilot_telemetry


class CopilotTelemetryTests(unittest.TestCase):
    @patch("app.jobs.copilot_telemetry.emit")
    @patch("app.jobs.copilot_telemetry.log_job_run_log")
    @patch("app.jobs.copilot_telemetry.enqueue_impacted_mvs_for_tables")
    @patch("app.jobs.copilot_telemetry._upsert_response_times")
    @patch("app.jobs.copilot_telemetry._fetch_response_times", return_value=[])
    @patch("app.jobs.copilot_telemetry._upsert_tools")
    @patch("app.jobs.copilot_telemetry._fetch_tool_performance", return_value=[])
    @patch("app.jobs.copilot_telemetry._upsert_topics")
    @patch("app.jobs.copilot_telemetry._fetch_topic_performance", return_value=[])
    @patch("app.jobs.copilot_telemetry._insert_errors")
    @patch("app.jobs.copilot_telemetry._fetch_errors", return_value=[])
    @patch("app.jobs.copilot_telemetry._insert_events")
    @patch("app.jobs.copilot_telemetry._fetch_events", return_value=[])
    @patch("app.jobs.copilot_telemetry._upsert_sessions")
    @patch("app.jobs.copilot_telemetry._fetch_sessions")
    @patch("app.jobs.copilot_telemetry.db.fetch_one", return_value={"config": {"lookback_hours": 24}})
    @patch.object(copilot_telemetry, "APPINSIGHTS_APP_ID", "app-id")
    @patch.object(copilot_telemetry, "APPINSIGHTS_API_KEY", "api-key")
    def test_run_enqueues_impacted_mvs_after_session_upsert(
        self,
        _mock_fetch_one,
        mock_fetch_sessions,
        mock_upsert_sessions,
        _mock_fetch_events,
        _mock_insert_events,
        _mock_fetch_errors,
        _mock_insert_errors,
        _mock_fetch_topics,
        _mock_upsert_topics,
        _mock_fetch_tools,
        _mock_upsert_tools,
        _mock_fetch_response_times,
        _mock_upsert_response_times,
        mock_enqueue_impacted_mvs,
        mock_log_job_run_log,
        _mock_emit,
    ):
        sessions = [{"conversationId": "session-1", "started_at": "2026-03-13T00:00:00Z", "ended_at": "2026-03-13T00:05:00Z"}]
        mock_fetch_sessions.return_value = sessions
        mock_enqueue_impacted_mvs.return_value = {
            "tables": ["copilot_sessions"],
            "queued": 1,
            "queued_mvs": ["mv_copilot_summary"],
        }

        copilot_telemetry.run_copilot_telemetry(run_id="run-1", job_id="job-1")

        mock_upsert_sessions.assert_called_once_with(sessions)
        mock_enqueue_impacted_mvs.assert_called_once_with(["copilot_sessions"])
        self.assertEqual(mock_log_job_run_log.call_args.kwargs["context"]["mv_refresh_queue"]["queued_mvs"], ["mv_copilot_summary"])

    @patch("app.jobs.copilot_telemetry.emit")
    @patch("app.jobs.copilot_telemetry.log_job_run_log")
    @patch("app.jobs.copilot_telemetry.enqueue_impacted_mvs_for_tables")
    @patch("app.jobs.copilot_telemetry._upsert_response_times")
    @patch("app.jobs.copilot_telemetry._fetch_response_times", return_value=[])
    @patch("app.jobs.copilot_telemetry._upsert_tools")
    @patch("app.jobs.copilot_telemetry._fetch_tool_performance", return_value=[])
    @patch("app.jobs.copilot_telemetry._upsert_topics")
    @patch("app.jobs.copilot_telemetry._fetch_topic_performance", return_value=[])
    @patch("app.jobs.copilot_telemetry._insert_errors")
    @patch("app.jobs.copilot_telemetry._fetch_errors", return_value=[])
    @patch("app.jobs.copilot_telemetry._insert_events")
    @patch("app.jobs.copilot_telemetry._fetch_events", return_value=[])
    @patch("app.jobs.copilot_telemetry._upsert_sessions")
    @patch("app.jobs.copilot_telemetry._fetch_sessions", return_value=[])
    @patch("app.jobs.copilot_telemetry.db.fetch_one", return_value={"config": {"lookback_hours": 24}})
    @patch.object(copilot_telemetry, "APPINSIGHTS_APP_ID", "app-id")
    @patch.object(copilot_telemetry, "APPINSIGHTS_API_KEY", "api-key")
    def test_run_skips_mv_queue_when_no_sessions_were_ingested(
        self,
        _mock_fetch_one,
        _mock_fetch_sessions,
        mock_upsert_sessions,
        _mock_fetch_events,
        _mock_insert_events,
        _mock_fetch_errors,
        _mock_insert_errors,
        _mock_fetch_topics,
        _mock_upsert_topics,
        _mock_fetch_tools,
        _mock_upsert_tools,
        _mock_fetch_response_times,
        _mock_upsert_response_times,
        mock_enqueue_impacted_mvs,
        mock_log_job_run_log,
        _mock_emit,
    ):
        copilot_telemetry.run_copilot_telemetry(run_id="run-2", job_id="job-2")

        mock_upsert_sessions.assert_not_called()
        mock_enqueue_impacted_mvs.assert_not_called()
        self.assertEqual(mock_log_job_run_log.call_args.kwargs["context"]["mv_refresh_queue"]["queued"], 0)

    @patch("app.jobs.copilot_telemetry.emit")
    @patch("app.jobs.copilot_telemetry.log_job_run_log")
    @patch("app.jobs.copilot_telemetry._dv_resolve_bot_id", return_value="agent-123")
    @patch("app.jobs.copilot_telemetry.db.execute")
    @patch("app.jobs.copilot_telemetry.db.fetch_all", return_value=[])
    @patch("app.jobs.copilot_telemetry.DataverseClient")
    def test_sync_dv_blocks_creates_missing_active_block_for_disabled_row(
        self,
        mock_dataverse_client,
        _mock_fetch_all,
        mock_execute,
        _mock_resolve_bot_id,
        mock_log_job_run_log,
        _mock_emit,
    ):
        mock_dataverse_client.return_value.fetch_table.return_value = [
            {
                "cr6c3_agentname": "Agent Name",
                "cr6c3_username": "user@example.com",
                "cr6c3_disableflagcopilot": True,
                "cr6c3_copilotflagchangereason": "Policy violation",
                "cr6c3_userlastmodifiedby": "admin@example.com",
            }
        ]

        copilot_telemetry._sync_dv_blocks(run_id="run-sync-1")

        mock_execute.assert_called_once()
        sql, params = mock_execute.call_args.args
        self.assertIn("INSERT INTO copilot_access_blocks", sql)
        self.assertEqual(params, [
            "user@example.com",
            "user@example.com",
            "agent-123",
            "Agent Name",
            "admin@example.com",
            "Policy violation",
        ])
        self.assertTrue(
            any(call.kwargs.get("message") == "dv_block_sync_block_created" for call in mock_log_job_run_log.mock_calls)
        )

    @patch("app.jobs.copilot_telemetry.emit")
    @patch("app.jobs.copilot_telemetry.log_job_run_log")
    @patch("app.jobs.copilot_telemetry._dv_resolve_bot_id", return_value="agent-123")
    @patch("app.jobs.copilot_telemetry.db.execute")
    @patch(
        "app.jobs.copilot_telemetry.db.fetch_all",
        return_value=[
            {
                "user_principal_name": "user@example.com",
                "user_id": "legacy-user",
                "bot_name": None,
                "bot_id": "agent-123",
            }
        ],
    )
    @patch("app.jobs.copilot_telemetry.DataverseClient")
    def test_sync_dv_blocks_recognizes_existing_block_by_bot_id_alias(
        self,
        mock_dataverse_client,
        _mock_fetch_all,
        mock_execute,
        _mock_resolve_bot_id,
        mock_log_job_run_log,
        _mock_emit,
    ):
        mock_dataverse_client.return_value.fetch_table.return_value = [
            {
                "cr6c3_agentname": "Agent Name",
                "cr6c3_username": "user@example.com",
                "cr6c3_disableflagcopilot": True,
                "cr6c3_copilotflagchangereason": "Already blocked",
                "cr6c3_userlastmodifiedby": "admin@example.com",
            }
        ]

        copilot_telemetry._sync_dv_blocks(run_id="run-sync-2")

        mock_execute.assert_not_called()
        self.assertFalse(
            any(call.kwargs.get("message") == "dv_block_sync_block_created" for call in mock_log_job_run_log.mock_calls)
        )


if __name__ == "__main__":
    unittest.main()
