import test from "node:test";
import assert from "node:assert/strict";
import {
  canonical,
  hashDocument,
  decimalUnits,
  sourceForSpec,
  rulesForSpec,
  bindTerms,
  observeCandle,
} from "../scripts/oracle-observer-core.mjs";
import { keccak256, stringToHex } from "viem";
const spec = {
  kind: "coinbase-candle-close-v1",
  product: "BTC-USD",
  candleStart: 1800000000,
  thresholdUsd: "83000.00",
};
const fake = (rows) => async () => ({ ok: true, json: async () => rows });
test("oracle compares exact USD decimals and rejects malformed inputs", () => {
  assert.equal(decimalUnits("83000.00000001"), 8300000000001n);
  for (const v of ["-1", "NaN", "1e4", "1.000000001"]) assert.throws(() => decimalUnits(v));
  assert.equal(canonical({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.throws(() => sourceForSpec({ ...spec, product: "UNTRUSTED" }));
});
test("observation accepts only a single closed, consistent exact candle", async () => {
  const row = [spec.candleStart, 82990, 83010, 83000, 83000, 2];
  const result = await observeCandle(spec, fake([row]), spec.candleStart + 120);
  assert.equal(result.outcome, 0);
  assert.equal(result.sourceTimestamp, spec.candleStart + 60);
  await assert.rejects(observeCandle(spec, fake([row]), spec.candleStart + 119), /Wait/);
  await assert.rejects(observeCandle(spec, fake([]), spec.candleStart + 120), /Missing/);
  await assert.rejects(observeCandle(spec, fake([row, row]), spec.candleStart + 120), /duplicate/);
  await assert.rejects(
    observeCandle(
      spec,
      fake([[spec.candleStart, 82990, 83010, 83000, 85000, 2]]),
      spec.candleStart + 120,
    ),
    /Inconsistent/,
  );
  await assert.rejects(
    observeCandle(spec, async () => ({ ok: false, status: 429 }), spec.candleStart + 120),
    /429/,
  );
});
test("oracle spec is cryptographically bound to published metadata, rules, source and close time", () => {
  const metadata = {
    title: "Operator validation market",
    outcomes: ["Yes", "No"],
    ...sourceForSpec(spec),
    rules: rulesForSpec(spec),
  };
  const market = {
    metadataHash: hashDocument(metadata),
    rulesHash: keccak256(stringToHex(metadata.rules)),
    sourceHash: hashDocument(sourceForSpec(spec)),
    closeAt: spec.candleStart + 60,
    outcomeCount: 2,
  };
  assert.doesNotThrow(() => bindTerms(metadata, market, spec));
  assert.throws(() => bindTerms({ ...metadata, title: "Changed" }, market, spec), /hash mismatch/);
  assert.throws(
    () => bindTerms(metadata, { ...market, closeAt: market.closeAt + 1 }, spec),
    /pre-agreed/,
  );
  assert.throws(() => bindTerms(metadata, market, { ...spec, thresholdUsd: "1" }), /pre-agreed/);
});
