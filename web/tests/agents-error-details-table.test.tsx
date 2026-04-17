import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

const Module = require("node:module");
const testGlobals = globalThis as typeof globalThis & {
  __psTmpAliasRegistered?: boolean;
  __psNextNavigationMocked?: boolean;
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

if (!testGlobals.__psNextNavigationMocked) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === "next/navigation") {
      return {
        usePathname: () => "/dashboard/agents",
        useRouter: () => ({ push: () => undefined }),
        useSearchParams: () => new URLSearchParams(),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  testGlobals.__psNextNavigationMocked = true;
}

const { ErrorDetailsTable } = require("../app/dashboard/agents/error-details-table") as typeof import("../app/dashboard/agents/error-details-table");

test("error details table renders conversation id as the final column", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ErrorDetailsTable, {
      items: [
        {
          timestamp: "2026-04-17T14:30:00.000Z",
          agent: "Student Services",
          channel: "teams",
          userName: "Taylor Example",
          errorCode: "connector_timeout",
          errorMessage: "Connector timed out while fetching transcript.",
          sessionId: "conv-123",
        },
      ],
    })
  );

  assert.ok(markup.indexOf("Error Message") < markup.indexOf("Conversation ID"));
  assert.match(markup, /Connector timed out while fetching transcript\./);
  assert.match(markup, /conv-123/);
});

test("agents page mounts error details through a client-only table", () => {
  const source = readFileSync(path.join(process.cwd(), "app/dashboard/agents/page.tsx"), "utf8");

  assert.match(source, /import \{ ErrorDetailsTable \} from "\.\/error-details-table";/);
  assert.match(source, /<ErrorDetailsTable items=\{errorDetails\} \/>/);
  assert.match(source, /Click a column header to sort\./);
});
