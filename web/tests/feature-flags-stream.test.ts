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

type FeatureFlagsPayload = import("../app/lib/feature-flags-config").FeatureFlagsPayload;

const pg = require("pg") as { Client: unknown };
const originalClient = pg.Client;
const {
  resetFeatureFlagStreamForTests,
  subscribeToFeatureFlagUpdates,
} = require("../app/lib/feature-flags-stream") as typeof import("../app/lib/feature-flags-stream");
const { setFeatureFlagsQueryForTests } = require("../app/lib/feature-flags") as typeof import("../app/lib/feature-flags");
const { LICENSE_FEATURE_DEFAULTS, setLicenseSummaryForTests } = require("../app/lib/license") as typeof import("../app/lib/license");

type MockHandler = (value?: any) => void;

class MockClient {
  static instances: MockClient[] = [];
  static connectBehaviors: Array<() => Promise<void>> = [];

  handlers = new Map<string, MockHandler[]>();

  constructor() {
    MockClient.instances.push(this);
  }

  on(event: string, handler: MockHandler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  removeAllListeners() {
    this.handlers.clear();
  }

  async connect() {
    const behavior = MockClient.connectBehaviors.shift();
    if (behavior) {
      await behavior();
    }
  }

  async query(_text: string) {}

  async end() {}

  emit(event: string, value?: any) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(value);
    }
  }

  static reset() {
    MockClient.instances = [];
    MockClient.connectBehaviors = [];
  }
}

function setSnapshotPayload(payload: FeatureFlagsPayload) {
  setLicenseSummaryForTests({
    status: "active",
    mode: "full",
    verificationStatus: "verified",
    verificationError: null,
    artifactId: "artifact-1",
    sha256: "hash",
    uploadedAt: "2026-03-23T12:00:00.000Z",
    uploadedBy: { oid: null, upn: null, name: null },
    payload: null,
    features: { ...LICENSE_FEATURE_DEFAULTS, agents_dashboard: payload.flags.agents_dashboard },
  });

  setFeatureFlagsQueryForTests(async <T = any>(text: string) => {
    if (text.includes("FROM feature_flags")) {
      return Object.entries(payload.flags).map(([feature_key, enabled]) => ({ feature_key, enabled })) as T[];
    }
    if (text.includes("FROM table_update_log")) {
      return [{ last_updated_at: payload.version }] as T[];
    }
    throw new Error(`Unexpected feature-flag query: ${text}`);
  });
}

function captureConsoleError() {
  const original = console.error;
  const calls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  return {
    calls,
    restore() {
      console.error = original;
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function cleanup() {
  setFeatureFlagsQueryForTests(null);
  setLicenseSummaryForTests(null);
  await resetFeatureFlagStreamForTests();
  MockClient.reset();
  pg.Client = originalClient;
  delete process.env.DATABASE_URL;
}

test("scheduled reconnect failures are caught and logged", async () => {
  const reconnectError = new Error("reconnect failed");
  const consoleError = captureConsoleError();
  let unhandledRejection: unknown;
  let unsubscribe: (() => void) | undefined;

  process.env.DATABASE_URL = "postgres://example";
  pg.Client = MockClient as typeof pg.Client;
  MockClient.connectBehaviors = [async () => {}, async () => Promise.reject(reconnectError)];

  const onUnhandledRejection = (error: unknown) => {
    unhandledRejection = error;
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    unsubscribe = await subscribeToFeatureFlagUpdates(() => {});

    const listener = MockClient.instances[0];
    assert.ok(listener);

    listener.emit("error");
    await waitFor(() => consoleError.calls.length === 1, 2_500);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(unhandledRejection, undefined);
    assert.match(String(consoleError.calls[0]?.[0]), /Feature flag stream reconnect failed/);
    assert.equal(consoleError.calls[0]?.[1], reconnectError);
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    unsubscribe?.();
    consoleError.restore();
    await cleanup();
  }
});

test("notification broadcast failures are caught and logged", async () => {
  const subscriberError = new Error("subscriber failed");
  const consoleError = captureConsoleError();
  let unhandledRejection: unknown;
  let unsubscribe: (() => void) | undefined;

  process.env.DATABASE_URL = "postgres://example";
  pg.Client = MockClient as typeof pg.Client;
  MockClient.connectBehaviors = [async () => {}];
  setSnapshotPayload({
    flags: { agents_dashboard: true, test_mode: false },
    version: "2026-03-20T16:00:00.000Z",
  });

  const onUnhandledRejection = (error: unknown) => {
    unhandledRejection = error;
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    unsubscribe = await subscribeToFeatureFlagUpdates(() => {
      throw subscriberError;
    });

    const listener = MockClient.instances[0];
    assert.ok(listener);

    listener.emit("notification", { channel: "ps_feature_state_changed" });
    await waitFor(() => consoleError.calls.length === 1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(unhandledRejection, undefined);
    assert.match(String(consoleError.calls[0]?.[0]), /Feature flag stream broadcast failed/);
    assert.equal(consoleError.calls[0]?.[1], subscriberError);
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    unsubscribe?.();
    consoleError.restore();
    await cleanup();
  }
});
