import os
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

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


if __name__ == "__main__":
    unittest.main()
