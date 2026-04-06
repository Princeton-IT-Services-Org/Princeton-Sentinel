import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ENTRA_TENANT_ID = "tenant-id";
process.env.ENTRA_CLIENT_ID = "client-id";
process.env.ENTRA_CLIENT_SECRET = "client-secret";

const { getAuthOptions } = require("../app/lib/auth") as typeof import("../app/lib/auth");

test("getAuthOptions configures Azure AD with PKCE", () => {
  const options = getAuthOptions();
  const provider = options.providers?.[0];

  assert.equal(provider?.id, "azure-ad");
  assert.deepEqual((provider as any)?.options?.checks, ["pkce", "state"]);
  assert.equal((provider as any)?.options?.authorization?.params?.response_mode, undefined);
});

test("jwt callback derives claims without persisting provider tokens", async () => {
  const options = getAuthOptions();
  const jwt = options.callbacks?.jwt;
  assert.ok(jwt);

  const token = await jwt?.({
    token: {},
    account: {
      id_token:
        "header.eyJvaWQiOiJvaWQtMSIsInByZWZlcnJlZF91c2VybmFtZSI6InVzZXJAZXhhbXBsZS5jb20iLCJncm91cHMiOlsiZ3JvdXAtMSJdfQ.signature",
      access_token: "provider-access-token",
    } as any,
    profile: {
      oid: "profile-oid",
      upn: "profile@example.com",
      groups: ["profile-group"],
    } as any,
    user: undefined as any,
    trigger: "signIn",
    isNewUser: false,
    session: undefined,
  });

  assert.deepEqual(token, {
    oid: "oid-1",
    upn: "user@example.com",
    groups: ["group-1"],
  });
  assert.equal("accessToken" in (token as object), false);
  assert.equal("idToken" in (token as object), false);
});

test("session callback does not expose provider access tokens", async () => {
  const options = getAuthOptions();
  const sessionCallback = options.callbacks?.session;
  assert.ok(sessionCallback);

  const session = await sessionCallback?.({
    session: { user: { name: "Example User", email: "user@example.com", image: null } } as any,
    token: {
      accessToken: "provider-access-token",
      oid: "oid-1",
      upn: "user@example.com",
      groups: ["group-1"],
    } as any,
    user: undefined as any,
    newSession: undefined as any,
    trigger: "update",
  });

  assert.deepEqual(session, {
    user: {
      name: "Example User",
      email: "user@example.com",
      image: null,
      oid: "oid-1",
      upn: "user@example.com",
      groups: ["group-1"],
    },
    groups: ["group-1"],
  });
  assert.equal("accessToken" in (session as object), false);
});
