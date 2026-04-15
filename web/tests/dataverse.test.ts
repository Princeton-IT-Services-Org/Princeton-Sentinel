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

function withEnv() {
  process.env.DATAVERSE_BASE_URL = "https://org.crm.dynamics.com";
  process.env.ENTRA_TENANT_ID = "tenant-id";
  process.env.ENTRA_CLIENT_ID = "client-id";
  process.env.ENTRA_CLIENT_SECRET = "client-secret";
}

function loadDataverseModule(stubs: Record<string, any> = {}) {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request: string, parent: unknown, isMain: boolean) {
    if (request in stubs) {
      return stubs[request];
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  const modulePath = require.resolve("../app/lib/dataverse");
  delete require.cache[modulePath];

  try {
    return require(modulePath) as typeof import("../app/lib/dataverse");
  } finally {
    Module._load = originalLoad;
  }
}

test("fetchDataverseTable reuses cached token and follows pagination", async () => {
  withEnv();
  let acquireCalls = 0;
  const fetchCalls: string[] = [];
  let fetchIndex = 0;
  const originalFetch = global.fetch;

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push(url);
    fetchIndex += 1;

    if (fetchIndex % 2 === 1) {
      return new Response(
        JSON.stringify({
          value: [{ id: "row-1" }],
          "@odata.nextLink": "https://org.crm.dynamics.com/api/data/v9.2/test_entities?page=2",
        }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ value: [{ id: "row-2" }] }), { status: 200 });
  }) as typeof fetch;

  try {
    const dataverse = loadDataverseModule({
      "server-only": {},
      "@azure/msal-node": {
        ConfidentialClientApplication: class {
          async acquireTokenSilent() {
            return null;
          }
          async acquireTokenByClientCredential() {
            acquireCalls += 1;
            return {
              accessToken: "token-1",
              expiresOn: new Date(Date.now() + 60 * 60 * 1000),
            };
          }
        },
      },
    });

    const first = await dataverse.fetchDataverseTable("test_entities", { select: "name" });
    const second = await dataverse.fetchDataverseTable("test_entities", { select: "name" });

    assert.deepEqual(first, [{ id: "row-1" }, { id: "row-2" }]);
    assert.deepEqual(second, [{ id: "row-1" }, { id: "row-2" }]);
    assert.equal(acquireCalls, 1);
    assert.equal(fetchCalls.length, 4);
  } finally {
    global.fetch = originalFetch;
  }
});

test("patchDataverseRow issues a PATCH request", async () => {
  withEnv();
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; method: string; body: string | null }> = [];

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method || "GET",
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const dataverse = loadDataverseModule({
      "server-only": {},
      "@azure/msal-node": {
        ConfidentialClientApplication: class {
          async acquireTokenSilent() {
            return null;
          }
          async acquireTokenByClientCredential() {
            return {
              accessToken: "token-1",
              expiresOn: new Date(Date.now() + 60 * 60 * 1000),
            };
          }
        },
      },
    });

    await dataverse.patchDataverseRow("test_entities", "row-1", { enabled: true });

    assert.deepEqual(calls, [
      {
        url: "https://org.crm.dynamics.com/api/data/v9.2/test_entities(row-1)",
        method: "PATCH",
        body: JSON.stringify({ enabled: true }),
      },
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("getDataverseErrorResponse maps configuration and permission errors", () => {
  withEnv();
  const dataverse = loadDataverseModule({
    "server-only": {},
    "@azure/msal-node": {
      ConfidentialClientApplication: class {},
    },
  });

  assert.deepEqual(
    dataverse.getDataverseErrorResponse(new Error("ENTRA_TENANT_ID/ENTRA_CLIENT_ID/ENTRA_CLIENT_SECRET must be set"), "fallback"),
    {
      error: "ENTRA_TENANT_ID/ENTRA_CLIENT_ID/ENTRA_CLIENT_SECRET must be set",
      dv_error_type: "not_configured",
      status: 502,
    }
  );

  assert.deepEqual(
    dataverse.getDataverseErrorResponse(new Error("Dataverse PATCH failed (403): forbidden"), "fallback"),
    {
      error: "Dataverse PATCH failed (403): forbidden",
      dv_error_type: "permission_denied",
      status: 502,
    }
  );
});

test("fetchDataverseTable surfaces auth failures when token acquisition fails", async () => {
  withEnv();
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(null, { status: 200 })) as typeof fetch;

  try {
    const dataverse = loadDataverseModule({
      "server-only": {},
      "@azure/msal-node": {
        ConfidentialClientApplication: class {
          async acquireTokenSilent() {
            return null;
          }
          async acquireTokenByClientCredential() {
            return {};
          }
        },
      },
    });

    await assert.rejects(
      () => dataverse.fetchDataverseTable("test_entities"),
      /Failed to acquire Dataverse token/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
