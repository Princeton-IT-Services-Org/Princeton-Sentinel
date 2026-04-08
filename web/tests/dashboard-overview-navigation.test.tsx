import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const Module = require("node:module");
const testGlobals = globalThis as typeof globalThis & {
  __psTmpAliasRegistered?: boolean;
  __psDashboardPageMocksRegistered?: boolean;
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

if (!testGlobals.__psDashboardPageMocksRegistered) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === "next/dynamic") {
      return () => function MockDynamicComponent() {
        return null;
      };
    }
    if (request === "@/app/lib/db") {
      return { query: async () => [] };
    }
    if (request === "@/app/lib/auth") {
      return { requireUser: async () => undefined };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  testGlobals.__psDashboardPageMocksRegistered = true;
}

const { DashboardOverviewMetrics } = require("../components/dashboard-overview-metrics") as typeof import("../components/dashboard-overview-metrics");

test("overview metrics expose the expected dashboard destinations", () => {
  const markup = renderToStaticMarkup(
    React.createElement(DashboardOverviewMetrics, {
      totals: { sites: 10, users: 20, groups: 30, drives: 40 },
    })
  );

  assert.match(markup, /href="\/dashboard\/sites"/);
  assert.match(markup, /href="\/dashboard\/users"/);
  assert.match(markup, /href="\/dashboard\/groups"/);
  assert.match(markup, /href="\/dashboard\/activity"/);
  assert.match(markup, /SharePoint Sites/);
  assert.match(markup, /Active Users/);
  assert.match(markup, /Groups/);
  assert.match(markup, /Drives/);
});
