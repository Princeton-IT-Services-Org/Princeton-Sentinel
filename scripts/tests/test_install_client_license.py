import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "New Deployment Scripts" / "install_client_license.py"
SPEC = importlib.util.spec_from_file_location("install_client_license", MODULE_PATH)
install_client_license = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = install_client_license
SPEC.loader.exec_module(install_client_license)


class InstallClientLicenseTests(unittest.TestCase):
    def test_infer_license_id_reads_current_license_format(self):
        raw = (
            '{"schema_version":1,"license_id":"lic-123","license_type":"enterprise","tenant_id":"tenant-a",'
            '"issued_at":"2026-04-01T00:00:00Z","expires_at":null,"features":{"dashboard_read":true,'
            '"live_graph_read":true,"admin_view":true,"license_manage":true,"permission_revoke":false,'
            '"job_control":true,"graph_ingest":true,"copilot_telemetry":false,"agents_dashboard":true}}'
            "\n---SIGNATURE---\n"
            "ZmFrZVNpZ25hdHVyZQ==\n"
        )
        self.assertEqual(install_client_license.infer_license_id(raw), "lic-123")

    def test_load_license_text_rejects_missing_file(self):
        missing = ROOT / ".tmp-does-not-exist.license"
        with self.assertRaises(install_client_license.LicenseInstallError):
            install_client_license.load_license_text(missing)

    def test_load_license_text_reads_file(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            path = Path(tmp_dir) / "sample.license"
            path.write_text("example\n", encoding="utf-8")
            self.assertEqual(install_client_license.load_license_text(path), "example\n")


if __name__ == "__main__":
    unittest.main()
