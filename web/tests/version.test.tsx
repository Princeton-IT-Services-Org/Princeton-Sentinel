import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import AdminVersionBadge from "../app/admin/AdminVersionBadge";
import { getAppVersion } from "../app/lib/version";

const { compareVersions, extractVersionFromWorkflow } = require(
  path.join(process.cwd(), "..", "scripts", "staging-version.cjs"),
) as {
  compareVersions: (leftVersion: string, rightVersion: string) => number;
  extractVersionFromWorkflow: (contents: string) => string;
};

test("getAppVersion returns APP_VERSION when provided", () => {
  const originalAppVersion = process.env.APP_VERSION;

  process.env.APP_VERSION = "9.8.7";

  assert.equal(getAppVersion(), "9.8.7");

  if (originalAppVersion === undefined) {
    delete process.env.APP_VERSION;
  } else {
    process.env.APP_VERSION = originalAppVersion;
  }
});

test("getAppVersion falls back to 0.0.0 when APP_VERSION is missing", () => {
  const originalAppVersion = process.env.APP_VERSION;
  delete process.env.APP_VERSION;

  assert.equal(getAppVersion(), "0.0.0");

  if (originalAppVersion !== undefined) {
    process.env.APP_VERSION = originalAppVersion;
  }
});

test("staging version comparison requires strictly greater versions", () => {
  assert.equal(compareVersions("2.0.1", "2.0.0"), 1);
  assert.equal(compareVersions("2.0.0", "2.0.0"), 0);
  assert.equal(compareVersions("1.9.9", "2.0.0"), -1);
});

test("staging version extraction reads the top-level workflow value", () => {
  const version = extractVersionFromWorkflow([
    "name: Deploy Staging",
    "",
    "env:",
    "  STAGING_VERSION: 2.0.3",
    "  OTHER_VALUE: example",
    "",
    "jobs:",
    "  deploy:",
    "    runs-on: ubuntu-latest",
  ].join("\n"));

  assert.equal(version, "2.0.3");
});

test("admin version badge renders the current version label", () => {
  const markup = renderToStaticMarkup(<AdminVersionBadge version="2.0.0" />);

  assert.match(markup, /Version 2\.0\.0/);
});
