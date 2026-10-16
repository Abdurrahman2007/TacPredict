import test from "node:test";
import assert from "node:assert/strict";
import {
  isBanned,
  shapeUsers,
  suspendRefusal,
  adminRoleRefusal,
  matchesUserSearch,
  isUuid,
} from "../../src/lib/protocol/admin-users.mjs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-10-16T00:00:00Z");

test("suspension is only active while banned_until is in the future", () => {
  assert.equal(isBanned(undefined, NOW), false);
  assert.equal(isBanned("2026-10-15T00:00:00Z", NOW), false);
  assert.equal(isBanned("2126-10-15T00:00:00Z", NOW), true);
  assert.equal(isBanned("garbage", NOW), false);
});
test("users are joined with roles, verified wallets and open positions, newest first", () => {
  const rows = shapeUsers({
    now: NOW,
    users: [
      { id: A, email: "a@x.io", created_at: "2026-10-01T00:00:00Z", app_metadata: { providers: ["email"] } },
      { id: B, email: "b@x.io", created_at: "2026-10-10T00:00:00Z", banned_until: "2126-01-01T00:00:00Z" },
    ],
    adminIds: [A],
    wallets: [
      { id: "w1", address: "0xabc", user_id: A, verified_at: "2026-10-02T00:00:00Z" },
      { id: "w2", address: "0xdef", user_id: A, verified_at: null },
      { id: "w3", address: "0x123", user_id: null, verified_at: "2026-10-02T00:00:00Z" },
    ],
    openByWallet: new Map([["w1", 3], ["w2", 9]]),
  });
  assert.deepEqual(rows.map((r) => r.id), [B, A]);
  assert.equal(rows[0].suspended, true);
  assert.equal(rows[1].isAdmin, true);
  assert.deepEqual(rows[1].wallets, ["0xabc"]);
  assert.equal(rows[1].openPositions, 3);
  assert.deepEqual(rows[1].providers, ["email"]);
});
test("suspension guards", () => {
  assert.equal(suspendRefusal({ actorId: A, targetId: B, targetIsAdmin: false, suspend: true }), null);
  assert.match(suspendRefusal({ actorId: A, targetId: A, targetIsAdmin: false, suspend: true }), /own account/);
  assert.match(suspendRefusal({ actorId: A, targetId: B, targetIsAdmin: true, suspend: true }), /admin role first/);
  assert.equal(suspendRefusal({ actorId: A, targetId: B, targetIsAdmin: true, suspend: false }), null);
  assert.equal(suspendRefusal({ actorId: A, targetId: "nope", targetIsAdmin: false, suspend: true }), "Invalid user.");
});
test("admin role guards keep at least one admin and never self-demote", () => {
  assert.equal(adminRoleRefusal({ actorId: A, targetId: B, makeAdmin: true, adminIds: [A], targetSuspended: false }), null);
  assert.match(adminRoleRefusal({ actorId: A, targetId: B, makeAdmin: true, adminIds: [A, B], targetSuspended: false }), /already/);
  assert.match(adminRoleRefusal({ actorId: A, targetId: B, makeAdmin: true, adminIds: [A], targetSuspended: true }), /suspension/);
  assert.match(adminRoleRefusal({ actorId: A, targetId: A, makeAdmin: false, adminIds: [A, B], targetSuspended: false }), /own admin/);
  assert.match(adminRoleRefusal({ actorId: A, targetId: B, makeAdmin: false, adminIds: [B], targetSuspended: false }), /At least one/);
  assert.equal(adminRoleRefusal({ actorId: A, targetId: B, makeAdmin: false, adminIds: [A, B], targetSuspended: false }), null);
  assert.match(adminRoleRefusal({ actorId: A, targetId: C, makeAdmin: false, adminIds: [A, B], targetSuspended: false }), /not an admin/);
});
test("search matches email, id and wallet", () => {
  const u = { id: A, email: "Ann@x.io", wallets: ["0xAbC"] };
  assert.equal(matchesUserSearch(u, "ann@"), true);
  assert.equal(matchesUserSearch(u, "0xabc"), true);
  assert.equal(matchesUserSearch(u, "zzz"), false);
  assert.equal(matchesUserSearch(u, "  "), true);
  assert.equal(isUuid(A), true);
  assert.equal(isUuid("x"), false);
});
