import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chartView } from "../../src/lib/updown/chart-window.mjs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
const now = Date.UTC(2026, 9, 18, 11, 50, 30);
const history = Array.from({ length: 13 }, (_, i) => ({
  time: now - 3600000 + i * 300000,
  price: 81000 + i,
}));
test("a future window shows real recent history, never future or invented points", () => {
  const view = chartView(
    [...history, { time: now + 20000, price: 99000 }],
    { start: now + 270000, end: now + 570000, minutes: 5 },
    now,
  );
  assert.equal(view.mode, "recent");
  assert.equal(view.series.length, 13);
  assert.deepEqual(view.series, history);
  assert.equal(view.range.end, now);
});
test("a sparse live window gets labelled context rather than one isolated dot", () => {
  const view = chartView(history, { start: now - 30000, end: now + 270000, minutes: 5 }, now);
  assert.equal(view.mode, "recent");
  assert.ok(view.series.length > 2);
  assert.ok(view.series.every((p) => history.includes(p)));
});
test("a populated live window uses only its own observations", () => {
  const view = chartView(history, { start: now - 900000, end: now + 300000, minutes: 20 }, now);
  assert.equal(view.mode, "window");
  assert.equal(view.series.length, 4);
  assert.equal(view.range.start, now - 900000);
  assert.equal(view.range.end, now);
});
test("past-window context cannot include prices after its closing time", () => {
  const end = now - 1200000;
  const view = chartView(history, { start: end - 1000, end, minutes: 5 }, now);
  assert.equal(view.mode, "recent");
  assert.ok(view.series.length > 1);
  assert.ok(view.series.every((p) => p.time <= end));
});
test("missing provider observations remain empty rather than fabricate a line", () => {
  assert.deepEqual(chartView([], { start: now, end: now + 300000, minutes: 5 }, now).series, []);
});
test("duration bar is removed from detail and context range is visible", () => {
  const d = src("components/updown/updown-detail.tsx");
  assert.ok(!d.includes('className="ud-durations"'));
  assert.ok(d.includes("Starts in"));
  const c = src("components/updown/coingecko-chart.tsx");
  assert.ok(c.includes("Recent price history"));
  assert.ok(c.includes("clock(range.start"));
  assert.ok(c.includes("History start"));
  assert.ok(c.includes("Reload chart"));
  assert.ok(!c.includes("cg-attribution"));
});
test("full historical cache is separate from spot-only snapshot history", () => {
  const s = src("lib/coingecko.server.ts");
  assert.ok(s.includes("history-v4/${asset}"));
  assert.ok(s.includes("public,max-age=600"));
  assert.ok(!s.includes("histories.set(asset, { points: shared.histories[asset]"));
});

test("a lone recent observation keeps its real timestamp even for a future window", () => {
  const point = { time: now - 1000, price: 81000 };
  const view = chartView([point], { start: now + 300000, end: now + 600000, minutes: 5 }, now);
  assert.deepEqual(view.series, [point]);
  assert.equal(view.range.end, point.time);
  assert.ok(view.range.start < point.time);
});
