import { test } from "node:test";
import assert from "node:assert/strict";

import { isValidCronExpression } from "../app/lib/cron";

test("cron validation accepts valid five-field cron expressions", () => {
  assert.equal(isValidCronExpression("*/5 * * * *"), true);
  assert.equal(isValidCronExpression("0 0 * * 1-5"), true);
  assert.equal(isValidCronExpression("15 9,17 * 1,6,12 1"), true);
});

test("cron validation rejects invalid expressions", () => {
  assert.equal(isValidCronExpression(""), false);
  assert.equal(isValidCronExpression("* * *"), false);
  assert.equal(isValidCronExpression("0 24 * * *"), false);
  assert.equal(isValidCronExpression("0 * * * MON"), false);
});
