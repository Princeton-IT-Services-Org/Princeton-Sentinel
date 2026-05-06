import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("root metadata uses the Princeton logo as the browser tab icon", () => {
  const source = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");

  assert.match(source, /icons:\s*\{/);
  assert.match(source, /icon:\s*"\/pis-logo\.png"/);
});
