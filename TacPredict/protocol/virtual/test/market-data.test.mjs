import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMarketEvidence,
  validateResolutionSpec,
} from "../../../src/lib/virtual/market-data.ts";
const policy = {
  kind: "crypto",
  asset: "BTC",
  intervalSeconds: 300,
  observationToleranceSeconds: 2,
  tie: "void",
  sourceId: "reviewed-source",
  maxFetchAgeSeconds: 30,
};
const e = {
  kind: "crypto",
  sourceId: "reviewed-source",
  sourceUrl: "https://example.test/proof",
  payloadHash: "0x" + "1".repeat(64),
  fetchedAt: 405,
  asset: "BTC",
  open: { timestamp: 100, priceAtoms: "10000" },
  close: { timestamp: 400, priceAtoms: "10001" },
};
test("crypto evidence checks asset, frozen interval, positive exact boundary samples, tie and freshness", () => {
  assert.deepEqual(validateMarketEvidence(policy, e, 100, 400, 410), { voided: false, winner: 0 });
  assert.deepEqual(
    validateMarketEvidence(
      policy,
      { ...e, close: { ...e.close, priceAtoms: "10000" } },
      100,
      400,
      410,
    ),
    { voided: true, winner: 0 },
  );
  for (const change of [
    { sourceId: "wrong" },
    { asset: "ETH" },
    { fetchedAt: 300 },
    { fetchedAt: 500 },
    { payloadHash: "invalid" },
    { open: { timestamp: 90, priceAtoms: "10000" } },
    { close: { timestamp: 400, priceAtoms: "0" } },
  ])
    assert.throws(() => validateMarketEvidence(policy, { ...e, ...change }, 100, 400, 410));
  assert.throws(() => validateMarketEvidence(policy, e, 100, 401, 410));
  assert.throws(() => validateMarketEvidence(policy, e, 100, 400, 399));
});
test("sports evidence rejects wrong fixtures, non-final, future, abandoned and stale results; explicit draw policy", () => {
  const p = {
    kind: "sports",
    sport: "cricket",
    eventId: "fixture-1",
    draw: "void",
    sourceId: "official",
    maxFetchAgeSeconds: 60,
  };
  const r = {
    kind: "sports",
    sourceId: "official",
    sourceUrl: "https://example.test/proof",
    payloadHash: "0x" + "2".repeat(64),
    fetchedAt: 500,
    sport: "cricket",
    eventId: "fixture-1",
    status: "completed",
    finishedAt: 450,
    winner: "away",
  };
  assert.deepEqual(validateMarketEvidence(p, r, 100, 400, 510), { voided: false, winner: 1 });
  assert.deepEqual(validateMarketEvidence(p, { ...r, winner: "draw" }, 100, 400, 510), {
    voided: true,
    winner: 0,
  });
  for (const change of [
    { status: "live" },
    { status: "postponed" },
    { status: "abandoned" },
    { eventId: "fixture-2" },
    { finishedAt: 600 },
    { winner: "none" },
    { fetchedAt: 440 },
  ])
    assert.throws(() => validateMarketEvidence(p, { ...r, ...change }, 100, 400, 510));
  assert.deepEqual(
    validateMarketEvidence(
      { ...p, draw: "third-outcome" },
      { ...r, winner: "draw" },
      100,
      400,
      510,
    ),
    { voided: false, winner: 2 },
  );
  assert.throws(() => validateResolutionSpec({ ...p, draw: "third-outcome" }, "Sports", 2));
});

test("a closing observation cannot postdate the alleged source fetch", () => {
  assert.throws(() => validateMarketEvidence(policy, { ...e, fetchedAt: 399 }, 100, 400, 410));
});
