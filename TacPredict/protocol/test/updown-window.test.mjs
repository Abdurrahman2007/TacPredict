import test from "node:test";
import assert from "node:assert/strict";
import {
  windowStartFor,
  makeWindow,
  windowState,
  resolveWindow,
  windowsAround,
  priceToBeat,
  windowResult,
  deltaInfo,
  formatCountdown,
  matchNativeMarket,
  seriesForWindow,
  thin,
  formatUsd,
  assetFromSlug,
  parseDuration,
  durationLabel,
} from "../../src/lib/updown/window.mjs";

const T = Date.parse("2026-10-16T15:17:42Z"); // 21:17:42 in Dhaka
const START = Date.parse("2026-10-16T15:15:00Z");

test("windows are aligned to the clock", () => {
  assert.equal(windowStartFor(T, 5), START);
  assert.equal(windowStartFor(T, 15), Date.parse("2026-10-16T15:15:00Z"));
  assert.equal(windowStartFor(T, 60), Date.parse("2026-10-16T15:00:00Z"));
  const w = makeWindow(START, 5);
  assert.equal(w.end - w.start, 300000);
  assert.equal(windowState(w, T), "live");
  assert.equal(windowState(w, START - 1), "upcoming");
  assert.equal(windowState(w, w.end), "past");
});
test("window parameter falls back to the current window when invalid", () => {
  assert.equal(resolveWindow(String(START - 300000), T, 5).start, START - 300000);
  assert.equal(resolveWindow("123", T, 5).start, START);
  assert.equal(resolveWindow(undefined, T, 5).start, START);
  assert.equal(resolveWindow(String(START + 7 * 300000), T, 5).start, START);
  assert.equal(resolveWindow(String(START - 48 * 3600000), T, 5).start, START);
});
test("window list is ordered and includes the live one", () => {
  const list = windowsAround(T, 5, 2, 2);
  assert.equal(list.length, 5);
  assert.equal(list[2].start, START);
  assert.ok(list.every((w, i) => i === 0 || w.start - list[i - 1].start === 300000));
});
const candle = (t, o, c) => ({ time: t, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c });
test("price to beat and result come only from real candles", () => {
  const candles = [candle(START, 100, 101), candle(START + 60000, 101, 102), candle(START + 240000, 103, 99)];
  assert.equal(priceToBeat(candles, START), 100);
  assert.equal(priceToBeat(candles, START + 60000), 101);
  assert.equal(priceToBeat([], START), null);
  assert.equal(priceToBeat(candles, START - 300000), null);
  assert.deepEqual(windowResult(candles, makeWindow(START, 5)), { open: 100, close: 99, outcome: "Down" });
  assert.equal(windowResult([candle(START, 100, 101)], makeWindow(START, 5)), null);
  const up = [candle(START, 100, 100), candle(START + 240000, 100, 100)];
  assert.equal(windowResult(up, makeWindow(START, 5)).outcome, "Up"); // equal counts as Up
});
test("delta and countdown", () => {
  assert.deepEqual(deltaInfo(101, 100), { abs: 1, pct: 1, direction: "up" });
  assert.equal(deltaInfo(99, 100).direction, "down");
  assert.equal(deltaInfo(100, 100).direction, "flat");
  assert.equal(deltaInfo(null, 100), null);
  assert.equal(deltaInfo(100, 0), null);
  assert.equal(formatCountdown(61000), "01:01");
  assert.equal(formatCountdown(-5), "00:00");
  assert.equal(formatCountdown(3725000), "1:02:05");
  assert.equal(formatCountdown(1), "00:01");
});
test("native market is matched by asset, title and exact window", () => {
  const w = makeWindow(START, 5);
  const m = (title, s, e, native = true) => ({
    id: title + s,
    title,
    category: "Crypto",
    startsAt: new Date(s).toISOString(),
    endsAt: new Date(e).toISOString(),
    ...(native ? { native: {} } : {}),
  });
  const list = [
    m("Ethereum Up or Down", START, START + 300000),
    m("Bitcoin Up or Down", START, START + 900000),
    m("Bitcoin Up or Down", START + 300000, START + 600000),
    m("Bitcoin Up or Down", START, START + 300000, false),
    m("Bitcoin Up or Down - 5 min", START + 500, START + 300500),
  ];
  assert.equal(matchNativeMarket(list, "bitcoin", w).id, "Bitcoin Up or Down - 5 min" + (START + 500));
  assert.equal(matchNativeMarket(list, "ethereum", w).title, "Ethereum Up or Down");
  assert.equal(matchNativeMarket(list, "solana", w), null);
});
test("series prefers candles, then trades, then live ticks, clipped to the window", () => {
  const w = makeWindow(START, 5);
  const now = START + 150000;
  const candles = [candle(START, 100, 101), candle(START + 60000, 101, 102)];
  const trades = [{ time: START + 70000, price: 102.5 }, { time: START + 80000, price: 103 }];
  const ticks = [{ time: START + 75000, price: 999 }, { time: START + 100000, price: 104 }, { time: START + 400000, price: 1 }];
  const series = seriesForWindow({ candles, trades, ticks, w, nowMs: now });
  const times = series.map((p) => p.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(series.every((p) => p.time >= w.start && p.time <= now));
  assert.ok(!series.some((p) => p.price === 999 || p.price === 1));
  assert.equal(series.at(-1).price, 104);
  assert.equal(series[0].price, 100);
  assert.deepEqual(seriesForWindow({ candles: [], trades: [], ticks: [], w, nowMs: now }), []);
});
test("thin keeps ends; formatting; slugs", () => {
  const pts = Array.from({ length: 1000 }, (_, i) => ({ time: i, price: i + 1 }));
  const t = thin(pts, 100);
  assert.equal(t.length, 100);
  assert.equal(t[0].time, 0);
  assert.equal(t.at(-1).time, 999);
  assert.equal(thin(pts.slice(0, 5), 100).length, 5);
  assert.equal(formatUsd(67123.456, "bitcoin"), "$67,123.46");
  assert.equal(formatUsd(0), "$0");
  assert.equal(assetFromSlug("BTC"), "bitcoin");
  assert.equal(assetFromSlug("xrp"), null);
  assert.equal(parseDuration("15"), 15);
  assert.equal(parseDuration("7"), 5);
  assert.equal(durationLabel(60), "1 hour");
  assert.equal(durationLabel(5), "5 min");
});
