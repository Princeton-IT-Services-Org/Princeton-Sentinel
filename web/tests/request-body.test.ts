import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBooleanInput, parseRequestBody } from "../app/lib/request-body";

test("parseRequestBody marks malformed JSON payloads as invalid", async () => {
  const req = new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid json",
  });

  const parsed = await parseRequestBody(req);
  assert.equal(parsed.bodyType, "json");
  assert.equal(parsed.invalidJson, true);
});

test("parseBooleanInput only accepts explicit boolean-like values", () => {
  assert.equal(parseBooleanInput(true), true);
  assert.equal(parseBooleanInput("true"), true);
  assert.equal(parseBooleanInput(false), false);
  assert.equal(parseBooleanInput("false"), false);
  assert.equal(parseBooleanInput("yes"), null);
  assert.equal(parseBooleanInput(""), null);
});
