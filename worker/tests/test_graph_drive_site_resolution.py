import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.graph_client import GraphError
from app.jobs import graph_ingest


class FakeCursor:
    def __init__(self, responses=None):
        self.responses = responses or {}
        self.executed = []
        self._fetchall = []
        self.rowcount = 0

    def execute(self, sql, params=None):
        normalized = " ".join(sql.split())
        lower = normalized.lower()
        self.executed.append((normalized, params))

        if lower.startswith("select id, mail, user_principal_name from msgraph_users"):
            self._fetchall = list(self.responses.get("user_maps", []))
            self.rowcount = len(self._fetchall)
            return

        self._fetchall = []
        self.rowcount = 0

    def fetchall(self):
        return list(self._fetchall)


class FakeConnection:
    def __init__(self, responses=None):
        self.cursor_obj = FakeCursor(responses=responses)
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        return None

    def rollback(self):
        return None

    def close(self):
        self.closed = True


class GraphDriveSiteResolutionTests(unittest.TestCase):
    def test_resolve_graph_site_id_from_url_walks_up_parent_paths(self):
        class FakeClient:
            def get_json(self, url):
                if url == "/sites/contoso.sharepoint.com:/sites/ai/Owners?$select=id,webUrl":
                    raise GraphError(404, "not found", url, "")
                if url == "/sites/contoso.sharepoint.com:/sites/ai?$select=id,webUrl":
                    return {"id": "contoso.sharepoint.com,site-guid,web-guid"}
                raise AssertionError(f"Unexpected URL: {url}")

        resolved = graph_ingest._resolve_graph_site_id_from_url(
            FakeClient(),
            "https://contoso.sharepoint.com/sites/ai/Owners",
            cache={},
        )

        self.assertEqual(resolved, "contoso.sharepoint.com,site-guid,web-guid")

    def test_compose_graph_site_id_from_sharepoint_ids_uses_site_and_web_ids(self):
        resolved = graph_ingest._compose_graph_site_id_from_sharepoint_ids(
            {
                "siteId": "site-guid",
                "webId": "web-guid",
                "siteUrl": "https://contoso.sharepoint.com/sites/ai",
            }
        )

        self.assertEqual(resolved, "contoso.sharepoint.com,site-guid,web-guid")

    def test_resolve_test_mode_drive_site_id_falls_back_to_group_root_site(self):
        class FakeClient:
            def get_json(self, url):
                if url == "/drives/drive-1/root?$select=webUrl,sharepointIds":
                    return {}
                if url == "/groups/group-1/sites/root?$select=id,webUrl":
                    return {
                        "id": "contoso.sharepoint.com,site-guid,web-guid",
                        "webUrl": "https://contoso.sharepoint.com/sites/ai",
                    }
                raise AssertionError(f"Unexpected get_json URL: {url}")

        resolved = graph_ingest._resolve_test_mode_drive_site_id(
            FakeClient(),
            {
                "id": "drive-1",
                "name": "ai Owners",
                "driveType": "documentLibrary",
                "quota": {},
            },
            owner_hint_id="group-1",
            owner_hint_type="group",
            site_url_cache={},
        )

        self.assertEqual(resolved, "contoso.sharepoint.com,site-guid,web-guid")

    @patch("app.jobs.graph_ingest.log_job_run_log")
    @patch("app.jobs.graph_ingest.emit")
    @patch("app.jobs.graph_ingest.db.get_conn")
    @patch("app.jobs.graph_ingest._flush_drive_batch")
    def test_test_mode_group_document_library_missing_sharepoint_site_id_is_resolved(
        self,
        mock_flush_drive_batch,
        mock_get_conn,
        _mock_emit,
        _mock_log_job_run_log,
    ):
        fake_conn = FakeConnection(responses={"user_maps": []})
        mock_get_conn.return_value = fake_conn

        captured_rows = []

        def fake_flush(cur, conn, upsert_sql, batch):
            captured_rows.extend(batch)
            return len(batch), 0

        mock_flush_drive_batch.side_effect = fake_flush

        class FakeClient:
            def iter_paged(self, url):
                if url.startswith("/groups/group-1/drives?"):
                    return iter(
                        [
                            {
                                "id": "drive-1",
                                "name": "ai Owners",
                                "driveType": "documentLibrary",
                                "webUrl": "https://contoso.sharepoint.com/sites/ai/Owners",
                                "quota": {},
                            }
                        ]
                    )
                raise AssertionError(f"Unexpected iter_paged URL: {url}")

            def get_json(self, url):
                if url == "/drives/drive-1/root?$select=webUrl,sharepointIds":
                    return {
                        "webUrl": "https://contoso.sharepoint.com/sites/ai/Owners",
                        "sharepointIds": {
                            "siteUrl": "https://contoso.sharepoint.com/sites/ai",
                        },
                    }
                if url == "/sites/contoso.sharepoint.com:/sites/ai?$select=id,webUrl":
                    return {
                        "id": "contoso.sharepoint.com,site-guid,web-guid",
                        "webUrl": "https://contoso.sharepoint.com/sites/ai",
                    }
                raise AssertionError(f"Unexpected get_json URL: {url}")

        scope = {
            "mode": "test",
            "group_ids": ["group-1"],
            "user_ids": [],
            "site_ids": [],
            "drive_ids": [],
        }

        result = graph_ingest._ingest_drives(FakeClient(), run_id="run-1", flush_every=1, scope=scope)

        self.assertEqual(result["drive_upserts"], 1)
        self.assertEqual(result["scoped_site_count"], 1)
        self.assertEqual(scope["site_ids"], ["contoso.sharepoint.com,site-guid,web-guid"])
        self.assertEqual(len(captured_rows), 1)
        self.assertEqual(captured_rows[0][1], "contoso.sharepoint.com,site-guid,web-guid")


if __name__ == "__main__":
    unittest.main()
