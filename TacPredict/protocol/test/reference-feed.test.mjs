import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReferenceCandles } from "../../src/lib/updown/reference-candles.mjs";
const good = { start: "60", open: "10", high: "13", low: "9", close: "12" };
test("reference OHLC preserves actual values in chronological order", () => {
  const rows = parseReferenceCandles({ candles: [{ ...good, start: "120" }, good] }, 180000);
  assert.deepEqual(
    rows.map((x) => x.time),
    [60000, 120000],
  );
  assert.deepEqual(rows[0], { time: 60000, open: 10, high: 13, low: 9, close: 12 });
});
test("reference OHLC rejects malformed, impossible and future observations without filling gaps", () => {
  const rows = parseReferenceCandles(
    {
      candles: [
        good,
        { ...good, start: "240" },
        { ...good, start: "120", high: "8" },
        { ...good, start: "180", low: "14" },
        { ...good, start: "100", close: "NaN" },
        { ...good, start: "90", open: null },
        null,
      ],
    },
    200000,
  );
  assert.equal(rows.length, 1);
  assert.throws(() => parseReferenceCandles({}, 200000));
});
test("public chart source stays server-side and independent from settlement evidence", () => {
  const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
  assert.ok(
    src("lib/updown/use-price-window.ts").includes("referenceWindowQueryOptions(asset, lookback)"),
  );
  assert.ok(
    src("lib/updown/reference.server.ts").includes(
      "api.coinbase.com/api/v3/brokerage/market/products",
    ),
  );
  assert.ok(src("lib/updown/reference.server.ts").includes("cache.put"));
  assert.ok(src("lib/updown/spot.server.ts").includes("https://api.exchange.coinbase.com"));
  assert.ok(src("routes/profile.tsx").includes("usePaperLedger"));
  assert.ok(src("routes/profile.tsx").includes("Virtual USDC"));
});

import { referenceLabelY } from "../../src/lib/updown/chart-window.mjs";
test("price tags do not collide when the reference is above or below latest", () => {
  for (const [ref, last] of [
    [110, 100],
    [90, 100],
    [38, 30],
    [160, 170],
    [30, 30],
  ]) {
    const tag = referenceLabelY(ref, last, 30, 180);
    assert.ok(Math.abs(tag - last) >= 28);
    assert.ok(tag >= 30 && tag <= 180);
  }
  assert.equal(referenceLabelY(150, 50, 30, 180), 150);
});
