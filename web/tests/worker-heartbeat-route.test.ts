import { test } from "node:test";
import assert from "node:assert/strict";

import { POST } from "../app/api/internal/worker-heartbeat/route";

test("worker heartbeat route rejects missing token", async () => {
  process.env.WORKER_HEARTBEAT_TOKEN = "heartbeat-secret";
  const req = new Request("http://localhost/api/internal/worker-heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sent_at: new Date().toISOString() }),
  });

  const res = await POST(req);
  assert.equal(res.status, 401);
});

test("worker heartbeat route accepts valid token", async () => {
  process.env.WORKER_HEARTBEAT_TOKEN = "heartbeat-secret";
  const req = new Request("http://localhost/api/internal/worker-heartbeat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Heartbeat-Token": "heartbeat-secret",
    },
    body: JSON.stringify({ sent_at: new Date().toISOString() }),
  });

  const res = await POST(req);
  const payload = await res.json();
  assert.equal(res.status, 200);
  assert.equal(payload.ok, true);
});
