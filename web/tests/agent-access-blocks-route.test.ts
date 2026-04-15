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

  const routePath = require.resolve("../app/api/agents/access-blocks/route");
  delete require.cache[routePath];

  try {
    return require(routePath) as typeof import("../app/api/agents/access-blocks/route");
  } finally {
    Module._load = originalLoad;
  }
}

function getNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

test("block updates dataverse directly and preserves audit logging", async () => {
  process.env.DATAVERSE_COLUMN_PREFIX = "cr6c3";
  process.env.DATAVERSE_TABLE_URL = "https://org.crm.dynamics.com/api/data/v9.2/cr6c3_table11s";
  const operations: string[] = [];
  const auditCalls: any[] = [];

  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireAdmin: async () => ({
        session: { user: { oid: "oid-1", upn: "admin@example.com", name: "Admin" } },
      }),
    },
    "@/app/lib/csrf": {
      validateCsrfRequest: () => ({ ok: true, token: "csrf-token" }),
    },
    "@/app/lib/db": {
      query: async (sql: string) => {
        if (sql.includes("INSERT INTO agent_access_revoke_log")) {
          operations.push("revoke-log");
          return [];
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    },
    "@/app/lib/audit": {
      writeAuditEvent: async (payload: any) => {
        operations.push("audit");
        auditCalls.push(payload);
      },
    },
    "@/app/lib/dataverse": {
      fetchDataverseTable: async () => [
        {
          cr6c3_table11id: "row-1",
          cr6c3_agentname: "Agent A",
          cr6c3_username: "user@example.com",
          cr6c3_disableflagcopilot: false,
        },
      ],
      patchDataverseRow: async () => {
        operations.push("dv-patch");
      },
      getDataverseErrorResponse: (error: Error) => ({
        error: error.message,
        dv_error_type: "unknown",
        status: 502,
      }),
    },
    "@/app/lib/worker-api": {
      callWorker: async (path: string) => {
        if (path === "/conditional-access/block") {
          operations.push("worker");
          return { res: { ok: true }, text: "" };
        }
        throw new Error(`unexpected worker path: ${path}`);
      },
      isWorkerTimeoutError: () => false,
      parseWorkerErrorText: (text: string) => text,
    },
    "@/app/lib/request-body": {
      parseRequestBody: async () => ({
        invalidJson: false,
        body: {
          action: "block",
          user_id: "user@example.com",
          user_display_name: "user@example.com",
          user_principal_name: "user@example.com",
          bot_id: "Agent A",
          bot_name: "Agent A",
          dv_row_id: "row-1",
          block_scope: "agent",
          block_reason: "Policy",
        },
      }),
      getNonEmptyString,
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
    "@/app/lib/license": {
      requireLicenseFeature: async () => undefined,
      LicenseFeatureError: class LicenseFeatureError extends Error {},
    },
  });

  const res = await POST(new Request("http://localhost/api/agents/access-blocks", { method: "POST" }));
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.equal(payload.status, "blocked");
  assert.deepEqual(operations, ["dv-patch", "revoke-log", "worker", "audit"]);
  assert.equal(auditCalls[0]?.action, "copilot_user_blocked");
});

test("unblock requires an active disabled dataverse row and does not touch local blocks table", async () => {
  process.env.DATAVERSE_COLUMN_PREFIX = "cr6c3";
  process.env.DATAVERSE_TABLE_URL = "https://org.crm.dynamics.com/api/data/v9.2/cr6c3_table11s";
  const operations: string[] = [];

  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireAdmin: async () => ({
        session: { user: { oid: "oid-1", upn: "admin@example.com", name: "Admin" } },
      }),
    },
    "@/app/lib/csrf": {
      validateCsrfRequest: () => ({ ok: true, token: "csrf-token" }),
    },
    "@/app/lib/db": {
      query: async (sql: string) => {
        if (sql.includes("copilot_access_blocks")) {
          operations.push("local-block-query");
        }
        if (sql.includes("INSERT INTO agent_access_revoke_log")) {
          operations.push("revoke-log");
          return [];
        }
        throw new Error(`unexpected query: ${sql}`);
      },
    },
    "@/app/lib/audit": {
      writeAuditEvent: async () => {
        operations.push("audit");
      },
    },
    "@/app/lib/dataverse": {
      fetchDataverseTable: async () => [
        {
          cr6c3_table11id: "row-1",
          cr6c3_agentname: "Agent A",
          cr6c3_username: "user@example.com",
          cr6c3_disableflagcopilot: true,
        },
      ],
      patchDataverseRow: async () => {
        operations.push("dv-patch");
      },
      getDataverseErrorResponse: (error: Error) => ({
        error: error.message,
        dv_error_type: "unknown",
        status: 502,
      }),
    },
    "@/app/lib/worker-api": {
      callWorker: async (path: string) => {
        if (path === "/conditional-access/unblock") {
          operations.push("worker");
          return { res: { ok: true }, text: "" };
        }
        throw new Error(`unexpected worker path: ${path}`);
      },
      isWorkerTimeoutError: () => false,
      parseWorkerErrorText: (text: string) => text,
    },
    "@/app/lib/request-body": {
      parseRequestBody: async () => ({
        invalidJson: false,
        body: {
          action: "unblock",
          user_id: "user@example.com",
          user_display_name: "user@example.com",
          user_principal_name: "user@example.com",
          bot_id: "Agent A",
          bot_name: "Agent A",
          dv_row_id: "row-1",
          block_scope: "agent",
          unblock_reason: "Resolved",
        },
      }),
      getNonEmptyString,
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
    "@/app/lib/license": {
      requireLicenseFeature: async () => undefined,
      LicenseFeatureError: class LicenseFeatureError extends Error {},
    },
  });

  const res = await POST(new Request("http://localhost/api/agents/access-blocks", { method: "POST" }));
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.equal(payload.status, "unblocked");
  assert.deepEqual(operations, ["worker", "dv-patch", "revoke-log", "audit"]);
});

test("route rejects missing csrf token before side effects", async () => {
  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireAdmin: async () => ({
        session: { user: { oid: "oid-1", upn: "admin@example.com", name: "Admin" } },
      }),
    },
    "@/app/lib/csrf": {
      validateCsrfRequest: () => ({ ok: false, error: "missing_csrf_token" }),
    },
    "@/app/lib/db": {
      query: async () => {
        throw new Error("db should not be called");
      },
    },
    "@/app/lib/audit": {
      writeAuditEvent: async () => {
        throw new Error("audit should not be called");
      },
    },
    "@/app/lib/dataverse": {
      fetchDataverseTable: async () => {
        throw new Error("dataverse should not be called");
      },
      patchDataverseRow: async () => {
        throw new Error("dataverse should not be called");
      },
      getDataverseErrorResponse: (error: Error) => ({
        error: error.message,
        dv_error_type: "unknown",
        status: 502,
      }),
    },
    "@/app/lib/worker-api": {
      callWorker: async () => {
        throw new Error("worker should not be called");
      },
      isWorkerTimeoutError: () => false,
      parseWorkerErrorText: (text: string) => text,
    },
    "@/app/lib/request-body": {
      parseRequestBody: async () => ({
        invalidJson: false,
        body: { action: "block" },
      }),
      getNonEmptyString,
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
    "@/app/lib/license": {
      requireLicenseFeature: async () => undefined,
      LicenseFeatureError: class LicenseFeatureError extends Error {},
    },
  });

  const res = await POST(new Request("http://localhost/api/agents/access-blocks", { method: "POST" }));

  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "missing_csrf_token" });
});
