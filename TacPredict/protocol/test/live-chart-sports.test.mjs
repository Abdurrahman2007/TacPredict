import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  referenceChartView,
  nearestObservation,
  mergeObservedCandles,
} from "../../src/lib/updown/chart-window.mjs";
import {
  DURATIONS,
  DISPLAY_DURATIONS,
  parseDuration,
  makeWindow,
} from "../../src/lib/updown/window.mjs";
import { POOL_DURATIONS } from "../../src/lib/pool/pool.mjs";
import {
  HOME_FEEDS,
  MARKET_SORTS,
  SPORTS_FILTERS,
  isSportsListing,
} from "../../src/lib/markets/public-tabs.mjs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("short rounds show 30-minute real context, never fabricated or future points", () => {
  const now = Date.UTC(2026, 9, 22, 12, 3);
  const w = makeWindow(Date.UTC(2026, 9, 22, 12), 5);
  const points = Array.from({ length: 60 }, (_, i) => ({
    time: now - (58 - i) * 60000,
    price: 100 + i,
  }));
  const view = referenceChartView(points, w, now);
  assert.equal(view.series.length, 31);
  assert.equal(view.series[0].time, now - 30 * 60000);
  assert.equal(view.series.at(-1).time, now);
  assert.ok(view.series.every((p) => points.includes(p)));
  assert.equal(view.mode, "recent");
  const past = referenceChartView(points, makeWindow(now - 15 * 60000, 5), now);
  assert.ok(past.series.every((p) => p.time <= now - 10 * 60000));
});
test("scrubbing chooses nearest real observation at first/middle/last, never interpolated prices", () => {
  const pts = [
    { time: 100, price: 5 },
    { time: 140, price: 7 },
    { time: 200, price: 9 },
  ];
  assert.equal(nearestObservation(pts, 50), pts[0]);
  assert.equal(nearestObservation(pts, 145), pts[1]);
  assert.equal(nearestObservation(pts, 300), pts[2]);
  assert.equal(nearestObservation([], 1), null);
});
test("live candles use only later real ticks and leave empty minutes empty", () => {
  const base = [{ time: 0, open: 10, high: 12, low: 9, close: 11 }];
  const out = mergeObservedCandles(
    base,
    [
      { time: 1000, price: 99 },
      { time: 20000, price: 8 },
      { time: 30000, price: 14 },
      { time: 180000, price: 20 },
      { time: 300000, price: 100 },
    ],
    60000,
    10000,
    200000,
  );
  assert.deepEqual(out, [
    { time: 0, open: 10, high: 14, low: 8, close: 14 },
    { time: 180000, open: 20, high: 20, low: 20, close: 20 },
  ]);
  assert.equal(base[0].close, 11);
});
test("1H is a display duration, not a silently enabled contract series", () => {
  assert.ok(DISPLAY_DURATIONS.includes(60));
  assert.equal(parseDuration(60), 60);
  assert.ok(!DURATIONS.includes(60));
  assert.ok(!POOL_DURATIONS.includes(60));
  assert.ok(src("components/up-down-section.tsx").includes("dense={!poolOn}"));
  assert.ok(src("components/up-down-section.tsx").includes("POOL_DURATIONS.includes(minutes)"));
  assert.ok(
    src("components/updown/updown-detail.tsx").includes("usePriceWindow(asset, w, nowMs, !poolOn)"),
  );
});
test("public sports tabs and admin tabs share definitions; crypto stays outside Markets", () => {
  assert.deepEqual(SPORTS_FILTERS, ["All", "Football", "Cricket"]);
  assert.equal(HOME_FEEDS.length, 4);
  assert.equal(MARKET_SORTS.length, 4);
  assert.equal(isSportsListing({ category: "Crypto", title: "Bitcoin" }), false);
  assert.equal(isSportsListing({ category: "Sports", title: "ICC T20 cricket" }), true);
  assert.equal(isSportsListing({ category: "Sports", title: "Football final" }), true);
  const markets = src("routes/markets.index.tsx");
  assert.ok(markets.includes("isSportsListing(market)"));
  assert.ok(!markets.includes("PrelaunchMarkets"));
  assert.ok(src("components/admin/views/public-pages.tsx").includes("HOME_FEEDS.map"));
  assert.ok(src("components/admin/views/public-pages.tsx").includes("MARKET_SORTS.map"));
});
test("sport logos are local and portfolio removes exactly the marked controls", () => {
  for (const sport of ["football", "cricket"])
    assert.ok(existsSync(new URL(`../../public/logos/sports/${sport}.svg`, import.meta.url)));
  const portfolio = src("routes/profile.tsx");
  assert.ok(!portfolio.includes("How values are calculated"));
  assert.ok(!portfolio.includes("Updated since (UTC)"));
  assert.ok(!portfolio.includes("Base Mainnet"));
  assert.ok(portfolio.includes("Unsupported network"));
  assert.ok(portfolio.includes("Wallet USDC"));
  const chart = src("components/updown/updown-chart.tsx");
  assert.ok(chart.includes("setPointerCapture"));
  assert.ok(chart.includes("nearestObservation(series, target)"));
  assert.ok(src("components/updown/coingecko-chart.tsx").includes("interactive\n"));
});
