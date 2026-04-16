import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("admin tabs include agent quarantine", () => {
  const source = readFileSync(path.join(process.cwd(), "app/admin/AdminTabs.tsx"), "utf8");
  assert.match(source, /Agent Quarantine/);
  assert.match(source, /\/admin\/agent-quarantine/);
});

test("agent quarantine admin page is wrapped with request timing", () => {
  const source = readFileSync(path.join(process.cwd(), "app/admin/agent-quarantine/page.tsx"), "utf8");
  assert.match(source, /withPageRequestTiming/);
  assert.match(source, /export default withPageRequestTiming\("\/admin\/agent-quarantine", AgentQuarantinePage\)/);
});
