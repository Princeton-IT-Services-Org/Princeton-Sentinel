import { test } from "node:test";
import assert from "node:assert/strict";

import { getAdminSubtitle } from "../app/admin/copy";

test("admin subtitle mentions scoped test mode when enabled", () => {
  assert.match(getAdminSubtitle(true), /Test mode is active/i);
  assert.match(getAdminSubtitle(true), /scoped to the configured test group/i);
});

test("admin subtitle stays unchanged when test mode is disabled", () => {
  assert.equal(getAdminSubtitle(false), "Operations and controls for ingestion, schedules, and worker health.");
});
