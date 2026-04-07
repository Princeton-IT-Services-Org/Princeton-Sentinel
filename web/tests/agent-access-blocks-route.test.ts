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

test("all-scope unblock keeps block active when worker cleanup fails", async () => {
  const operations: string[] = [];
  const auditCalls: any[] = [];

  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireAdmin: async () => ({
        session: { user: { oid: "oid-1", upn: "admin@example.com", name: "Admin" } },
      }),
    },
    "@/app/lib/db": {
      query: async (sql: string) => {
        if (sql.includes("SELECT id, block_scope")) {
          operations.push("select");
          return [{
            id: 42,
            block_scope: "all",
            bot_name: "Agent",
            user_display_name: "User",
            user_principal_name: "user@example.com",
          }];
        }
        operations.push("unexpected-query");
        throw new Error(`unexpected query: ${sql}`);
      },
    },
    "@/app/lib/audit": {
      writeAuditEvent: async (payload: any) => {
        operations.push("audit");
        auditCalls.push(payload);
      },
    },
    "@/app/lib/worker-api": {
      callWorker: async () => {
        operations.push("worker");
        return { res: { ok: false }, text: "graph_cleanup_failed" };
      },
      isWorkerTimeoutError: () => false,
      parseWorkerErrorText: (text: string) => text,
    },
    "@/app/lib/request-body": {
      parseRequestBody: async () => ({
        invalidJson: false,
        body: { action: "unblock", user_id: "user-1", bot_id: "bot-1" },
      }),
      getNonEmptyString,
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
  });

  const res = await POST(new Request("http://localhost/api/agents/access-blocks", { method: "POST" }));
  const payload = await res.json();

  assert.equal(res.status, 502);
  assert.equal(payload.error, "graph_cleanup_failed");
  assert.deepEqual(operations, ["select", "worker", "audit"]);
  assert.equal(auditCalls[0]?.action, "copilot_user_unblock_failed");
});

test("all-scope unblock updates the row only after worker cleanup succeeds", async () => {
  const operations: string[] = [];
  const auditCalls: any[] = [];

  const { POST } = loadRoute({
    "@/app/lib/auth": {
      requireAdmin: async () => ({
        session: { user: { oid: "oid-1", upn: "admin@example.com", name: "Admin" } },
      }),
    },
    "@/app/lib/db": {
      query: async (sql: string) => {
        if (sql.includes("SELECT id, block_scope")) {
          operations.push("select");
          return [{
            id: 42,
            block_scope: "all",
            bot_name: "Agent",
            user_display_name: "User",
            user_principal_name: "user@example.com",
          }];
        }
        if (sql.includes("UPDATE copilot_access_blocks")) {
          operations.push("update");
          return [{ id: 42 }];
        }
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
    "@/app/lib/worker-api": {
      callWorker: async () => {
        operations.push("worker");
        return { res: { ok: true }, text: "" };
      },
      isWorkerTimeoutError: () => false,
      parseWorkerErrorText: (text: string) => text,
    },
    "@/app/lib/request-body": {
      parseRequestBody: async () => ({
        invalidJson: false,
        body: { action: "unblock", user_id: "user-1", bot_id: "bot-1" },
      }),
      getNonEmptyString,
    },
    "@/app/lib/request-timing": {
      withApiRequestTiming: (_path: string, handler: Function) => handler,
    },
  });

  const res = await POST(new Request("http://localhost/api/agents/access-blocks", { method: "POST" }));
  const payload = await res.json();

  assert.equal(res.status, 200);
  assert.equal(payload.status, "unblocked");
  assert.deepEqual(operations, ["select", "worker", "update", "revoke-log", "audit"]);
  assert.equal(auditCalls[0]?.action, "copilot_user_unblocked");
});
