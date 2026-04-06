import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import Module from "node:module";

import { NextRequest } from "next/server";

import {
  applySecurityHeaders,
  CONTENT_SECURITY_POLICY_HEADER,
  GLOBAL_SECURITY_HEADERS,
  REFERRER_POLICY_HEADER,
  STRICT_TRANSPORT_SECURITY_HEADER,
  X_FRAME_OPTIONS_HEADER,
} from "../app/lib/security-headers";

const originalResolveFilename = (Module as any)._resolveFilename;

function installWorkspaceAliasResolver() {
  (Module as any)._resolveFilename = function resolveFilename(request: string, parent: unknown, isMain: boolean, options: unknown) {
    if (request.startsWith("@/")) {
      const mappedPath = path.resolve(__dirname, "..", request.slice(2));
      return originalResolveFilename.call(this, mappedPath, parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

function restoreWorkspaceAliasResolver() {
  (Module as any)._resolveFilename = originalResolveFilename;
}

function setMockToken(token: Record<string, unknown> | null) {
  const jwtModule = require("next-auth/jwt");
  jwtModule.getToken = async () => token;
}

function loadProxy() {
  const proxyPath = require.resolve("../proxy");
  delete require.cache[proxyPath];
  return require("../proxy") as typeof import("../proxy");
}

function assertGlobalSecurityHeaders(headers: Headers) {
  assert.equal(headers.get(STRICT_TRANSPORT_SECURITY_HEADER), GLOBAL_SECURITY_HEADERS[STRICT_TRANSPORT_SECURITY_HEADER]);
  assert.equal(headers.get(CONTENT_SECURITY_POLICY_HEADER), GLOBAL_SECURITY_HEADERS[CONTENT_SECURITY_POLICY_HEADER]);
  assert.equal(headers.get(X_FRAME_OPTIONS_HEADER), GLOBAL_SECURITY_HEADERS[X_FRAME_OPTIONS_HEADER]);
  assert.equal(headers.get(REFERRER_POLICY_HEADER), GLOBAL_SECURITY_HEADERS[REFERRER_POLICY_HEADER]);
}

test("applySecurityHeaders sets every global security header", () => {
  const response = applySecurityHeaders(new Response(null, { status: 204 }) as any);

  assertGlobalSecurityHeaders(response.headers);
});

test("proxy adds security headers to unauthenticated page redirects", async () => {
  installWorkspaceAliasResolver();
  try {
    process.env.NEXTAUTH_SECRET = "test-secret";
    setMockToken(null);
    const { proxy } = loadProxy();

    const response = await proxy(new NextRequest("http://localhost/dashboard?tab=summary"));

    assert.equal(response.status, 307);
    assert.equal(
      response.headers.get("location"),
      "http://localhost/signin/account?callbackUrl=%2Fdashboard%3Ftab%3Dsummary",
    );
    assertGlobalSecurityHeaders(response.headers);
  } finally {
    restoreWorkspaceAliasResolver();
  }
});

test("proxy adds security headers to authenticated pass-through responses", async () => {
  installWorkspaceAliasResolver();
  try {
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.USER_GROUP_ID = "user-group";
    setMockToken({ groups: ["user-group"] });
    const { proxy } = loadProxy();

    const response = await proxy(new NextRequest("http://localhost/dashboard"));

    assert.equal(response.status, 200);
    assertGlobalSecurityHeaders(response.headers);
  } finally {
    delete process.env.USER_GROUP_ID;
    restoreWorkspaceAliasResolver();
  }
});

test("proxy adds security headers to unauthorized API responses", async () => {
  installWorkspaceAliasResolver();
  try {
    process.env.NEXTAUTH_SECRET = "test-secret";
    setMockToken(null);
    const { proxy } = loadProxy();

    const response = await proxy(new NextRequest("http://localhost/api/jobs"));

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
    assertGlobalSecurityHeaders(response.headers);
  } finally {
    restoreWorkspaceAliasResolver();
  }
});

test("proxy adds security headers to forbidden API responses", async () => {
  installWorkspaceAliasResolver();
  try {
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.ADMIN_GROUP_ID = "admin-group";
    setMockToken({ groups: ["user-group"] });
    const { proxy } = loadProxy();

    const response = await proxy(new NextRequest("http://localhost/api/jobs"));

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "forbidden" });
    assertGlobalSecurityHeaders(response.headers);
  } finally {
    delete process.env.ADMIN_GROUP_ID;
    restoreWorkspaceAliasResolver();
  }
});

test("proxy adds security headers to public asset bypass responses", async () => {
  installWorkspaceAliasResolver();
  try {
    const { proxy } = loadProxy();

    const response = await proxy(new NextRequest("http://localhost/pis-logo.png"));

    assert.equal(response.status, 200);
    assertGlobalSecurityHeaders(response.headers);
  } finally {
    restoreWorkspaceAliasResolver();
  }
});
