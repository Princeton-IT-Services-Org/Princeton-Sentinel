import { test } from "node:test";
import assert from "node:assert/strict";

const nextConfig = require("../../next.config.js");

test("next config does not define custom response headers", () => {
  assert.equal(nextConfig.headers, undefined);
});
