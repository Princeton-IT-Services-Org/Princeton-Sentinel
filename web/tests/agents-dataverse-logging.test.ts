import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("agent access control API route is wrapped with request timing", () => {
  const source = readFileSync(path.join(process.cwd(), "app/api/agents/agent-access-control/route.ts"), "utf8");

  assert.match(source, /withApiRequestTiming/);
  assert.match(source, /export const GET = withApiRequestTiming\("\/api\/agents\/agent-access-control", getHandler\)/);
  assert.match(source, /export const POST = withApiRequestTiming\("\/api\/agents\/agent-access-control", postHandler\)/);
});

test("agent access control page is wrapped with page request timing", () => {
  const source = readFileSync(path.join(process.cwd(), "app/dashboard/agents/agent-access-control/page.tsx"), "utf8");

  assert.match(source, /redirectIfFeatureDisabled\("agents_dashboard"\)/);
  assert.match(source, /withPageRequestTiming/);
  assert.match(source, /export default withPageRequestTiming\("\/dashboard\/agents\/agent-access-control", AgentAccessControlPage\)/);
});
