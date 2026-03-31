import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.jobs import graph_ingest
from app.jobs.graph_ingest import TEST_MODE_GROUP_ENV, _resolve_test_mode_scope


class GraphTestModeScopeTests(unittest.TestCase):
    def setUp(self):
        self.original_group_id = os.environ.get(TEST_MODE_GROUP_ENV)

    def tearDown(self):
        if self.original_group_id is None:
            os.environ.pop(TEST_MODE_GROUP_ENV, None)
        else:
            os.environ[TEST_MODE_GROUP_ENV] = self.original_group_id

    def test_resolve_scope_uses_direct_members_and_user_direct_groups(self):
        os.environ[TEST_MODE_GROUP_ENV] = "test-group"

        class FakeClient:
            def get_json(self, url):
                if url.startswith("/groups/test-group?"):
                    return {
                        "id": "test-group",
                        "displayName": "Broken Users",
                        "mail": "broken@example.com",
                    }
                if url.startswith("/users/user-1?"):
                    return {
                        "id": "user-1",
                        "displayName": "User One",
                        "userPrincipalName": "user1@example.com",
                    }
                if url.startswith("/users/user-2?"):
                    return {
                        "id": "user-2",
                        "displayName": "User Two",
                        "userPrincipalName": "user2@example.com",
                    }
                raise AssertionError(f"Unexpected get_json URL: {url}")

            def iter_paged(self, url):
                if url.startswith("/groups/test-group/members/microsoft.graph.user?"):
                    return iter([{"id": "user-1"}, {"id": "user-2"}])
                if url.startswith("/users/user-1/memberOf/microsoft.graph.group?"):
                    return iter(
                        [
                            {"id": "group-a", "displayName": "Group A"},
                            {"id": "test-group", "displayName": "Broken Users"},
                        ]
                    )
                if url.startswith("/users/user-2/memberOf/microsoft.graph.group?"):
                    return iter([{"id": "group-b", "displayName": "Group B"}])
                raise AssertionError(f"Unexpected iter_paged URL: {url}")

        scope = _resolve_test_mode_scope(FakeClient())

        self.assertEqual(scope["mode"], "test")
        self.assertEqual(scope["group_id"], "test-group")
        self.assertEqual(scope["user_ids"], ["user-1", "user-2"])
        self.assertEqual(scope["group_ids"], ["group-a", "group-b", "test-group"])
        self.assertEqual(
            scope["group_memberships"],
            [
                ("group-a", "user-1", "user"),
                ("group-b", "user-2", "user"),
                ("test-group", "user-1", "user"),
                ("test-group", "user-2", "user"),
            ],
        )
        self.assertTrue(scope["scope_hash"])

    @patch("app.jobs.graph_ingest.enqueue_impacted_mvs_for_tables", return_value={"tables": [], "queued": 0, "queued_mvs": []})
    @patch("app.jobs.graph_ingest._save_graph_sync_scope_state")
    @patch("app.jobs.graph_ingest._prune_test_mode_data")
    @patch("app.jobs.graph_ingest._ingest_users", return_value={"mode": "test", "upserted": 1})
    @patch(
        "app.jobs.graph_ingest.get_graph_sync_runtime_config",
        return_value={
            "flush_every": 100,
            "pull_permissions": False,
            "sync_group_memberships": False,
            "group_memberships_users_only": True,
            "stages": ["users"],
            "skip_stages": [],
            "permissions_batch_size": 50,
            "permissions_stale_after_hours": 24,
        },
    )
    @patch("app.jobs.graph_ingest._apply_graph_sync_transition", return_value={"sites_delta_cleared": 0, "drive_item_deltas_cleared": 0})
    @patch(
        "app.jobs.graph_ingest._prepare_graph_sync_scope",
        return_value=(
            {
                "mode": "test",
                "group_id": "test-group",
                "scope_hash": "scope-hash",
                "group_ids": ["group-1"],
                "user_ids": ["user-1"],
                "group_rows": {},
                "user_rows": {},
                "group_memberships": [],
                "site_ids": [],
                "drive_ids": [],
            },
            {
                "scope_changed": False,
                "previous_mode": "test",
                "current_mode": "test",
            },
        ),
    )
    @patch("app.jobs.graph_ingest.GraphClient")
    @patch("app.jobs.graph_ingest.log_audit_event")
    @patch("app.jobs.graph_ingest.log_job_run_log")
    @patch("app.jobs.graph_ingest.emit")
    def test_run_graph_ingest_skips_test_mode_prune_when_drives_stage_not_run(
        self,
        _mock_emit,
        _mock_log_job_run_log,
        _mock_log_audit_event,
        _mock_graph_client,
        _mock_prepare_scope,
        _mock_apply_transition,
        _mock_runtime_config,
        mock_ingest_users,
        mock_prune,
        _mock_save_scope_state,
        _mock_enqueue_mvs,
    ):
        graph_ingest.run_graph_ingest(run_id="run-1", job_id="job-1")

        mock_ingest_users.assert_called_once()
        mock_prune.assert_not_called()


if __name__ == "__main__":
    unittest.main()
