import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import scheduler


class FakeCursor:
    def __init__(self):
        self._next_row = None
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((" ".join(sql.split()), params))
        normalized = " ".join(sql.split()).lower()
        if normalized.startswith("update job_schedules"):
            self._next_row = ("schedule-1",)
        elif normalized.startswith("insert into job_runs"):
            self._next_row = ("run-1",)
        else:
            self._next_row = None

    def fetchone(self):
        return self._next_row


class FakeConnection:
    def __init__(self):
        self.cursor_obj = FakeCursor()
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def cursor(self):
        return self.cursor_obj

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        self.closed = True


class SchedulerInvalidCronTests(unittest.TestCase):
    @patch("app.scheduler.emit")
    @patch("app.scheduler.log_audit_event")
    @patch("app.scheduler.db.get_conn")
    def test_invalid_cron_schedule_is_auto_disabled(self, mock_get_conn, mock_log_audit_event, _mock_emit):
        fake_conn = FakeConnection()
        mock_get_conn.return_value = fake_conn

        scheduler._disable_invalid_schedule(
            schedule_id="schedule-1",
            job_id="job-1",
            cron_expr="bad cron",
            error_reason="invalid_cron_expr: bad",
        )

        executed_sql = [sql for sql, _params in fake_conn.cursor_obj.executed]
        self.assertTrue(any("UPDATE job_schedules" in sql for sql in executed_sql))
        self.assertTrue(any("INSERT INTO job_runs" in sql for sql in executed_sql))
        self.assertTrue(any("INSERT INTO job_run_logs" in sql for sql in executed_sql))
        self.assertTrue(fake_conn.committed)
        self.assertTrue(fake_conn.closed)
        mock_log_audit_event.assert_called_once()
        self.assertEqual(mock_log_audit_event.call_args.kwargs["action"], "schedule_invalid_cron_disabled")


if __name__ == "__main__":
    unittest.main()
