import test from "node:test";
import assert from "node:assert/strict";
import {
  virtualQuoteKey,
  assertQuoteIntent,
  assertFreshProjection,
  missingReceiptStatus,
} from "../../../src/lib/virtual/guards.ts";
const wallet = "0x" + "2".repeat(40),
  intent = { wallet, marketId: "1", outcome: 0, isBuy: true, input: "100", nonce: "0" };
test("quotes are isolated by market, wallet, deployment, side, outcome and quantity", () => {
  const a = virtualQuoteKey("engine", "1", wallet, 0, "buy", "100");
  for (const b of [
    virtualQuoteKey("engine", "2", wallet, 0, "buy", "100"),
    virtualQuoteKey("other", "1", wallet, 0, "buy", "100"),
    virtualQuoteKey("engine", "1", "0x" + "3".repeat(40), 0, "buy", "100"),
    virtualQuoteKey("engine", "1", wallet, 0, "sell", "100"),
    virtualQuoteKey("engine", "1", wallet, 1, "buy", "100"),
    virtualQuoteKey("engine", "1", wallet, 0, "buy", "101"),
  ])
    assert.notDeepEqual(a, b);
  assert.doesNotThrow(() => assertQuoteIntent(intent, intent));
  for (const bad of [
    { marketId: "2" },
    { input: "101" },
    { isBuy: false },
    { outcome: 1 },
    { wallet: "0x" + "3".repeat(40) },
  ])
    assert.throws(() => assertQuoteIntent(intent, { ...intent, ...bad }));
});
test("old/future projections and invalid age policies block trading, not verified zero", () => {
  assert.doesNotThrow(() => assertFreshProjection(100n, 220n, 120));
  for (const args of [
    [100n, 221n, 120],
    [101n, 100n, 120],
    [100n, 100n, 0],
    [100n, 100n, Infinity],
  ])
    assert.throws(() => assertFreshProjection(...args));
});
test("a previously mined receipt disappearing becomes reorged, not fresh pending", () => {
  assert.equal(missingReceiptStatus(null), "pending");
  assert.equal(missingReceiptStatus({ block_number: null }), "pending");
  assert.equal(missingReceiptStatus({ block_number: "123" }), "reorged");
});

test("health checks reconcile conservation, checkpoint age, finality and independent pause", async () => {
  const { evaluateVirtualHealth } = await import("../../../src/lib/virtual/health.ts");
  const good = {
    observedAt: 104n,
    checkpoint: 10n,
    head: 12n,
    indexedAt: 100n,
    headAt: 104n,
    finalized: 9n,
    maxAgeSeconds: 120,
    paused: false,
    seeded: 100n,
    granted: 100n,
    cash: 80n,
    locked: 100n,
    fees: 10n,
    retired: 10n,
  };
  assert.equal(evaluateVirtualHealth(good).healthy, true);
  for (const [change, alert] of [
    [{ cash: 81n }, "ACCOUNTING_MISMATCH"],
    [{ headAt: 221n }, "STALE_INDEXER"],
    [{ finalized: 11n }, "INVALID_FINALITY"],
    [{ paused: true }, "CONTRACT_PAUSED"],
  ])
    assert(evaluateVirtualHealth({ ...good, ...change }).alerts.includes(alert));
});

test("server boundary strips provider URLs and secrets while preserving deliberate safe messages", async () => {
  const { publicVirtualBoundary } = await import("../../../src/lib/virtual/errors.ts");
  await assert.rejects(
    publicVirtualBoundary(async () => {
      throw Error("HTTP request failed https://rpc.example.test/SECRET_TEST_ONLY_TOKEN");
    }),
    (e) => !e.message.includes("SECRET_TEST_ONLY_TOKEN") && !e.message.includes("https://"),
  );
  await assert.rejects(
    publicVirtualBoundary(async () => {
      throw Error("Virtual trading disabled");
    }),
    { message: "Virtual trading disabled" },
  );
});

test("a frozen RPC head cannot look fresh merely because the indexer is equally old", async () => {
  const { assertFreshChainTime } = await import("../../../src/lib/virtual/guards.ts");
  assert.doesNotThrow(() => assertFreshChainTime(100n, 220n, 120));
  assert.throws(() => assertFreshChainTime(100n, 221n, 120));
  assert.throws(() => assertFreshChainTime(251n, 220n, 120));
});
