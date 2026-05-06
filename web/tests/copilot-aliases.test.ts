import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

test("copilot dashboard route exists without legacy API alias", () => {
  assert.equal(existsSync(path.join(process.cwd(), "app/dashboard/copilot/page.tsx")), true);
  assert.equal(existsSync(path.join(process.cwd(), "app/api/copilot/route.ts")), false);
});

test("copilot dashboard links all user rows to the drill-down route", () => {
  const dashboardSource = readFileSync(path.join(process.cwd(), "app/dashboard/copilot/page.tsx"), "utf8");

  assert.equal(existsSync(path.join(process.cwd(), "app/dashboard/copilot/users/[userId]/page.tsx")), true);
  assert.equal(dashboardSource.includes("/dashboard/copilot/users/"), true);
  assert.equal(dashboardSource.includes("LIMIT 10"), false);
});

test("app shell exposes dashboard/copilot as its own nav route", () => {
  const source = readFileSync(path.join(process.cwd(), "components/app-shell.tsx"), "utf8");

  assert.equal(source.includes("/dashboard/copilot"), true);
  assert.equal(source.includes("flags.copilot_dashboard"), true);
});
