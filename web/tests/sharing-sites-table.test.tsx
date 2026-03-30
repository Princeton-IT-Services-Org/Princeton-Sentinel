import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import React from "react";
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
        usePathname: () => "/dashboard/sharing",
        useRouter: () => ({ push: () => undefined }),
        useSearchParams: () => new URLSearchParams("sort=links&dir=desc"),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  testGlobals.__psNextNavigationMocked = true;
}

const { SharingSitesTable } = require("../app/dashboard/sharing/sharing-tables") as typeof import("../app/dashboard/sharing/sharing-tables");

test("sharing sites table renders simplified route-drive metrics with header tooltips", () => {
  const markup = renderToStaticMarkup(
    React.createElement(SharingSitesTable, {
      sites: [
        {
          route_drive_id: "drive-123",
          title: "Project Site",
          web_url: "https://example.sharepoint.com/sites/project",
          last_shared_at: "2026-03-28T10:00:00.000Z",
          sharing_links: 12,
          anonymous_links: 3,
          guestUsers: 4,
          externalUsers: 5,
        },
      ],
    })
  );

  assert.match(markup, /Sharing links/);
  assert.match(markup, /Anonymous links/);
  assert.match(markup, /Guest users/);
  assert.match(markup, /External users/);
  assert.match(markup, /Last permission sync seen/);
  assert.match(markup, /aria-label="The specific routable drive row that opens the linked site sharing page\."/);
  assert.match(markup, /aria-label="Permission records on this route drive where link_scope is present\."/);
  assert.match(markup, /aria-label="Sharing-link permissions on this route drive where link_scope is anonymous\."/);
  assert.match(markup, /aria-label="Distinct granted email identities on this route drive containing #EXT#\."/);
  assert.match(
    markup,
    /aria-label="Distinct granted email identities on this route drive outside configured internal domains, excluding guest-style identities\."/
  );
  assert.match(markup, /aria-label="Latest cached permission sync timestamp found for this route drive\."/);
  assert.match(markup, /href="\/sites\/drive-123\/sharing"/);
  assert.doesNotMatch(markup, /Oversharing/);
});
