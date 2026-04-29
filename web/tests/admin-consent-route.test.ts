import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

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

type Stubs = Record<string, any>;

function loadRoute(stubs: Stubs) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request in stubs) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const routePath = require.resolve("../app/api/auth/admin-consent/route");
  delete require.cache[routePath];

  try {
    return require(routePath) as typeof import("../app/api/auth/admin-consent/route");
  } finally {
    Module._load = originalLoad;
  }
}

function loadAdminConsentRoute() {
  return loadRoute({
    "@/app/lib/auth": {
      getSession: async () => ({ user: { oid: "oid-1" }, groups: ["admins"] }),
      getGroupsFromSession: () => ["admins"],
      isAdmin: () => true,
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
  });
}

function encodeState(callbackUrl: string) {
  return Buffer.from(JSON.stringify({ callbackUrl }), "utf8").toString("base64url");
}

test("admin consent redirect URI uses browser origin when NEXTAUTH_URL is a bind address", async () => {
  process.env.ENTRA_TENANT_ID = "tenant-id";
  process.env.ENTRA_CLIENT_ID = "client-id";
  process.env.NEXTAUTH_URL = "http://0.0.0.0:3000";

  const { GET } = loadAdminConsentRoute();
  const res = await GET(new Request("http://localhost:3000/api/auth/admin-consent?callbackUrl=%2Fdashboard%2Fagents%2Fagent-access-control") as any);
  const location = res.headers.get("location");

  assert.ok(location);
  const consentUrl = new URL(location);
  assert.equal(consentUrl.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/admin-consent/callback");
  assert.doesNotMatch(consentUrl.searchParams.get("redirect_uri") || "", /0\.0\.0\.0/);
});

test("admin consent redirect URI keeps configured public NEXTAUTH_URL", async () => {
  process.env.ENTRA_TENANT_ID = "tenant-id";
  process.env.ENTRA_CLIENT_ID = "client-id";
  process.env.NEXTAUTH_URL = "https://sentinel.example.com";

  const { GET } = loadAdminConsentRoute();
  const res = await GET(new Request("http://localhost:3000/api/auth/admin-consent") as any);
  const location = res.headers.get("location");

  assert.ok(location);
  const consentUrl = new URL(location);
  assert.equal(consentUrl.searchParams.get("redirect_uri"), "https://sentinel.example.com/api/auth/admin-consent/callback");
});

test("admin consent callback final redirect uses public NEXTAUTH_URL instead of internal request host", async () => {
  process.env.NEXTAUTH_URL = "https://sentinel.example.com";

  const routePath = require.resolve("../app/api/auth/admin-consent/callback/route");
  delete require.cache[routePath];
  const { GET } = require(routePath) as typeof import("../app/api/auth/admin-consent/callback/route");

  const state = encodeState("/dashboard/agents/agent-access-control");
  const res = await GET(new Request(`http://0.0.0.0:3000/api/auth/admin-consent/callback?admin_consent=True&state=${state}`) as any);

  assert.equal(
    res.headers.get("location"),
    "https://sentinel.example.com/dashboard/agents/agent-access-control?adminConsent=granted",
  );
});
