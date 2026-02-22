import { test } from "node:test";
import assert from "node:assert/strict";

import { escapeCsvCell, toCsvRow } from "../app/lib/csv";

test("escapeCsvCell doubles embedded quotes and wraps cell", () => {
  assert.equal(escapeCsvCell('said "hello"'), '"said ""hello"""');
});

test("escapeCsvCell wraps cells with commas and newlines", () => {
  assert.equal(escapeCsvCell("a,b"), '"a,b"');
  assert.equal(escapeCsvCell("line 1\nline 2"), '"line 1\nline 2"');
});

test("escapeCsvCell normalizes nullish values to empty cells", () => {
  assert.equal(escapeCsvCell(null), "");
  assert.equal(escapeCsvCell(undefined), "");
});

test("toCsvRow preserves JSON text as a single escaped cell", () => {
  const detailsJson = JSON.stringify({ reason: "bad, \"quoted\" value" });
  const row = toCsvRow([42, detailsJson, null]);
  assert.equal(row, '42,"{""reason"":""bad, \\""quoted\\"" value""}",');
});
