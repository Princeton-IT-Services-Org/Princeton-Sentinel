import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const Module = require("node:module");
const testGlobals = globalThis as typeof globalThis & {
  __psTmpAliasRegistered?: boolean;
};

if (!testGlobals.__psTmpAliasRegistered) {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request: string, parent: unknown, isMain: boolean, options: unknown) {
    if (request.startsWith("@/")) {
      const mapped = path.join(process.cwd(), ".tmp-tests", request.slice(2));
      return originalResolveFilename.call(this, mapped, parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  testGlobals.__psTmpAliasRegistered = true;
}

const { MetricCard } = require("../components/metric-card") as typeof import("../components/metric-card");

test("metric card renders plain content without href", () => {
  const markup = renderToStaticMarkup(React.createElement(MetricCard, { label: "Active Users", value: "42" }));

  assert.match(markup, /Active Users/);
  assert.match(markup, />42</);
  assert.doesNotMatch(markup, /href="/);
});

test("metric card renders a semantic link when href is provided", () => {
  const markup = renderToStaticMarkup(
    React.createElement(MetricCard, { label: "Groups", value: "12", href: "/dashboard/groups" })
  );

  assert.match(markup, /href="\/dashboard\/groups"/);
  assert.match(markup, /cursor-pointer/);
  assert.match(markup, /Groups/);
});
