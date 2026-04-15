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

  const routePath = require.resolve("../app/api/agents/agent-access-control/route");
  delete require.cache[routePath];

  try {
    return require(routePath) as typeof import("../app/api/agents/agent-access-control/route");
  } finally {
    Module._load = originalLoad;
  }
}

test("GET reads Dataverse directly and filters rows by delete flag", async () => {
  process.env.DATAVERSE_COLUMN_PREFIX = "cr6c3";
  process.env.DATAVERSE_TABLE_URL = "https://org.crm.dynamics.com/api/data/v9.2/cr6c3_table11s";

  const { GET } = loadRoute({
    "@/app/lib/auth": {
      requireUser: async () => ({ groups: ["admins"] }),
      isAdmin: () => true,
    },
    "@/app/lib/dataverse": {
      fetchDataverseTable: async () => [
        {
          cr6c3_table11id: "row-1",
          cr6c3_agentname: "Agent A",
          cr6c3_username: "allowed@example.com",
          cr6c3_userdeleteflagadgroups: 4,
        },
        {
          cr6c3_table11id: "row-2",
          cr6c3_agentname: "Agent B",
          cr6c3_username: "blocked@example.com",
          cr6c3_userdeleteflagadgroups: 1,
        },
      ],
      patchDataverseRow: async () => {
        throw new Error("should not patch");
      },
      getDataverseErrorResponse: () => ({
        error: "dataverse_fetch_failed",
        dv_error_type: "unknown",
        status: 502,
      }),
    },
    "@/app/lib/csrf": {
      validateCsrfRequest: () => ({ ok: true }),
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
  });

  const res = await GET(new Request("http://localhost/api/agents/agent-access-control") as any);
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.equal(payload.count, 1);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.rows[0].cr6c3_username, "allowed@example.com");
});

test("POST patches Dataverse directly and returns classified errors", async () => {
  process.env.DATAVERSE_COLUMN_PREFIX = "cr6c3";
  process.env.DATAVERSE_TABLE_URL = "https://org.crm.dynamics.com/api/data/v9.2/cr6c3_table11s";
  const patchCalls: any[] = [];

  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireUser: async () => ({ groups: ["admins"] }),
      isAdmin: () => true,
    },
    "@/app/lib/dataverse": {
      fetchDataverseTable: async () => [],
      patchDataverseRow: async (_entitySet: string, rowId: string, data: Record<string, unknown>) => {
        patchCalls.push({ rowId, data });
      },
      getDataverseErrorResponse: (error: Error) => ({
        error: error.message,
        dv_error_type: "unknown",
        status: 502,
      }),
    },
    "@/app/lib/csrf": {
      validateCsrfRequest: () => ({ ok: true }),
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
  });

  const res = await POST(
    new Request("http://localhost/api/agents/agent-access-control", {
      method: "POST",
      body: JSON.stringify({ row_id: "row-1", data: { cr6c3_disableflagcopilot: true } }),
      headers: { "Content-Type": "application/json" },
    }) as any
  );

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "updated" });
  assert.deepEqual(patchCalls, [{ rowId: "row-1", data: { cr6c3_disableflagcopilot: true } }]);
});

test("POST returns dv_error_type when Dataverse patch fails", async () => {
  process.env.DATAVERSE_COLUMN_PREFIX = "cr6c3";
  process.env.DATAVERSE_TABLE_URL = "https://org.crm.dynamics.com/api/data/v9.2/cr6c3_table11s";

  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireUser: async () => ({ groups: ["admins"] }),
      isAdmin: () => true,
    },
    "@/app/lib/dataverse": {
      fetchDataverseTable: async () => [],
      patchDataverseRow: async () => {
        throw new Error("Dataverse PATCH failed (403): forbidden");
      },
      getDataverseErrorResponse: (error: Error) => ({
        error: error.message,
        dv_error_type: "permission_denied",
        status: 502,
      }),
    },
    "@/app/lib/csrf": {
      validateCsrfRequest: () => ({ ok: true }),
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
  });

  const res = await POST(
    new Request("http://localhost/api/agents/agent-access-control", {
      method: "POST",
      body: JSON.stringify({ row_id: "row-1", data: { cr6c3_disableflagcopilot: true } }),
      headers: { "Content-Type": "application/json" },
    }) as any
  );

  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), {
    error: "Dataverse PATCH failed (403): forbidden",
    dv_error_type: "permission_denied",
  });
});
