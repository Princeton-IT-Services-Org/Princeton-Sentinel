import { test } from "node:test";
import assert from "node:assert/strict";

import { buildThemeCookieValue, normalizeTheme, THEME_COOKIE_MAX_AGE, THEME_COOKIE_NAME } from "../app/lib/theme";

test("normalizeTheme accepts supported theme values", () => {
  assert.equal(normalizeTheme("light"), "light");
  assert.equal(normalizeTheme("dark"), "dark");
});

test("normalizeTheme rejects invalid theme values", () => {
  assert.equal(normalizeTheme(undefined), null);
  assert.equal(normalizeTheme(null), null);
  assert.equal(normalizeTheme("system"), null);
  assert.equal(normalizeTheme(""), null);
});

test("buildThemeCookieValue builds a site-wide persistent cookie", () => {
  assert.equal(
    buildThemeCookieValue("dark"),
    `${THEME_COOKIE_NAME}=dark; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax`
  );
});
