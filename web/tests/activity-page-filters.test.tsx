import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const Module = require("node:module");
const testGlobals = globalThis as typeof globalThis & {
  __psTmpAliasRegistered?: boolean;
  __psActivityPageMocksRegistered?: boolean;
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

if (!testGlobals.__psActivityPageMocksRegistered) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === "next/navigation") {
      return {
        usePathname: () => "/dashboard/activity",
        useRouter: () => ({ push: () => undefined }),
        useSearchParams: () => new URLSearchParams("sort=lastActivity&dir=desc&siteType=personal"),
      };
    }
    if (request === "@/app/lib/auth") {
      return { requireUser: async () => undefined };
    }
    if (request === "@/app/lib/db") {
      return {
        query: async (sql: string) => {
          if (sql.includes("COUNT(*)::int AS total")) return [{ total: 1 }];
          return [];
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  testGlobals.__psActivityPageMocksRegistered = true;
}

const { default: ActivityPage } = require("../app/dashboard/activity/page") as typeof import("../app/dashboard/activity/page");

test("activity page renders a site-type filter with the selected option", async () => {
  const page = await ActivityPage({
    searchParams: Promise.resolve({ siteType: "personal", days: "30" }),
  });
  const markup = renderToStaticMarkup(page);

  assert.match(markup, /name="siteType"/);
  assert.match(markup, /<option value="personal" selected="">Personal<\/option>/);
  assert.match(markup, /<option value="nonPersonal">Non-personal<\/option>/);
});
