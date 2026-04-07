import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.conditional_access import ConditionalAccessManager


class FakeGraphClient:
    def __init__(self):
        self.get_calls = []
        self.request_calls = []

    def get_json(self, path):
        self.get_calls.append(path)
        return {"value": [{"id": "sp-123"}]}

    def request_json(self, method, path, *, json=None):
        self.request_calls.append((method, path, json))
        return {}


class ConditionalAccessManagerAgentToggleTests(unittest.TestCase):
    def test_get_service_principal_object_id_queries_service_principals(self):
        graph = FakeGraphClient()
        manager = ConditionalAccessManager(graph=graph)

        object_id = manager.get_service_principal_object_id("app-123")

        self.assertEqual(object_id, "sp-123")
        self.assertEqual(
            graph.get_calls,
            ["/servicePrincipals?$filter=appId eq 'app-123'&$select=id"],
        )

    def test_disable_agent_patches_service_principal_account_enabled_false(self):
        graph = FakeGraphClient()
        manager = ConditionalAccessManager(graph=graph)

        result = manager.disable_agent("sp-123")

        self.assertTrue(result.success)
        self.assertEqual(
            graph.request_calls,
            [("PATCH", "/servicePrincipals/sp-123", {"accountEnabled": False})],
        )

    def test_enable_agent_patches_service_principal_account_enabled_true(self):
        graph = FakeGraphClient()
        manager = ConditionalAccessManager(graph=graph)

        result = manager.enable_agent("sp-123")

        self.assertTrue(result.success)
        self.assertEqual(
            graph.request_calls,
            [("PATCH", "/servicePrincipals/sp-123", {"accountEnabled": True})],
        )


if __name__ == "__main__":
    unittest.main()
