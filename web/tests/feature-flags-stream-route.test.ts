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

const { GET } = require("../app/api/feature-flags/stream/route") as typeof import("../app/api/feature-flags/stream/route");
const { setRequireUserForTests } = require("../app/lib/auth") as typeof import("../app/lib/auth");
const {
  resetFeatureFlagStreamForTests,
  setFeatureFlagSubscriptionForTests,
} = require("../app/lib/feature-flags-stream") as typeof import("../app/lib/feature-flags-stream");
const { setFeatureFlagsQueryForTests } = require("../app/lib/feature-flags") as typeof import("../app/lib/feature-flags");
const { LICENSE_FEATURE_DEFAULTS, setLicenseSummaryForTests } = require("../app/lib/license") as typeof import("../app/lib/license");
type FeatureFlagsPayload = import("../app/lib/feature-flags-config").FeatureFlagsPayload;

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

  let queryIndex = 0;
  const queryResponses = [
    Object.entries(payload.flags).map(([feature_key, enabled]) => ({ feature_key, enabled })),
    [{ last_updated_at: payload.version }],
  ];

  setFeatureFlagsQueryForTests(async () => {
    const response = queryResponses[queryIndex];
    queryIndex += 1;
    if (!response) {
      throw new Error("Unexpected feature-flag query");
    }
    return response as any[];
  });
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, pattern: string) {
  const decoder = new TextDecoder();
  let output = "";

  while (!output.includes(pattern)) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    output += decoder.decode(value, { stream: true });
  }

  return output;
}

async function cleanupTestState() {
  setRequireUserForTests(null);
  setFeatureFlagsQueryForTests(null);
  setLicenseSummaryForTests(null);
  setFeatureFlagSubscriptionForTests(null);
  await resetFeatureFlagStreamForTests();
}

test("feature-flag stream route emits a snapshot and later updates", async () => {
  setRequireUserForTests(async () => ({
    session: { user: { email: "user@example.com" } },
    groups: [],
  }));

  let capturedSubscriber: ((payload: FeatureFlagsPayload) => void) | null = null;
  let unsubscribed = false;
  setFeatureFlagSubscriptionForTests(async (subscriber) => {
    capturedSubscriber = subscriber;
    return () => {
      unsubscribed = true;
    };
  });

  setSnapshotPayload({
    flags: { agents_dashboard: true, test_mode: false },
    version: "2026-03-20T16:00:00.000Z",
  });

  const abortController = new AbortController();

  try {
    const response = await GET(new Request("http://localhost/api/feature-flags/stream", { signal: abortController.signal }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store, no-transform");

    const reader = response.body?.getReader();
    assert.ok(reader);

    const snapshotChunk = await readUntil(reader!, "event: snapshot");
    assert.match(snapshotChunk, /retry: 5000/);
    assert.match(snapshotChunk, /event: snapshot/);
    assert.match(snapshotChunk, /"agents_dashboard":true/);

    capturedSubscriber?.({
      flags: { agents_dashboard: false, test_mode: false },
      version: "2026-03-20T16:05:00.000Z",
    });

    const updateChunk = await readUntil(reader!, "event: updated");
    assert.match(updateChunk, /event: updated/);
    assert.match(updateChunk, /"agents_dashboard":false/);

    abortController.abort();
    await reader?.cancel();
    assert.equal(unsubscribed, true);
  } finally {
    await cleanupTestState();
  }
});

test("feature-flag stream route unsubscribes when the request aborts during startup", async () => {
  setRequireUserForTests(async () => ({
    session: { user: { email: "user@example.com" } },
    groups: [],
  }));

  let resolveSubscription: ((unsubscribe: () => void) => void) | null = null;
  let unsubscribed = false;
  let queryCalled = false;

  setFeatureFlagSubscriptionForTests(
    (subscriber) =>
      new Promise((resolve) => {
        void subscriber;
        resolveSubscription = resolve;
      })
  );
  setFeatureFlagsQueryForTests(async () => {
    queryCalled = true;
    return [];
  });

  const abortController = new AbortController();

  try {
    const response = await GET(new Request("http://localhost/api/feature-flags/stream", { signal: abortController.signal }));
    const reader = response.body?.getReader();
    assert.ok(reader);

    const readPromise = reader!.read();
    abortController.abort();
    resolveSubscription?.(() => {
      unsubscribed = true;
    });

    const result = await readPromise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(result.done, true);
    assert.equal(unsubscribed, true);
    assert.equal(queryCalled, false);
  } finally {
    await cleanupTestState();
  }
});
