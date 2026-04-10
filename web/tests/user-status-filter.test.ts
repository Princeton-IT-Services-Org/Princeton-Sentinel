import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildUserStatusPredicate,
  getUserStatusLabel,
  getUserStatusSubtitle,
  normalizeUserStatus,
} from "../app/dashboard/users/status-filter";

test("normalizeUserStatus defaults invalid or missing values to active", () => {
  assert.equal(normalizeUserStatus(undefined), "active");
  assert.equal(normalizeUserStatus(null), "active");
  assert.equal(normalizeUserStatus("bogus"), "active");
  assert.equal(normalizeUserStatus("inactive"), "inactive");
  assert.equal(normalizeUserStatus("all"), "all");
});

test("buildUserStatusPredicate returns the expected SQL fragment for each status", () => {
  assert.equal(buildUserStatusPredicate("active"), "AND u.deleted_at IS NULL AND u.account_enabled IS TRUE");
  assert.equal(buildUserStatusPredicate("inactive"), "AND u.deleted_at IS NULL AND u.account_enabled IS NOT TRUE");
  assert.equal(buildUserStatusPredicate("all"), "AND u.deleted_at IS NULL");
  assert.equal(buildUserStatusPredicate("active", "member"), "AND member.deleted_at IS NULL AND member.account_enabled IS TRUE");
});

test("user status labels and subtitles stay aligned with page copy", () => {
  assert.equal(getUserStatusLabel("active"), "Active");
  assert.equal(getUserStatusLabel("inactive"), "Inactive");
  assert.equal(getUserStatusLabel("all"), "All");

  assert.match(getUserStatusSubtitle("active"), /active users/i);
  assert.match(getUserStatusSubtitle("inactive"), /inactive users/i);
  assert.match(getUserStatusSubtitle("all"), /active and inactive accounts/i);
});
