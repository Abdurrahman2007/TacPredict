import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chartWindow } from "../../src/lib/updown/chart-window.mjs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("Home and Markets use one renderer for every market creation source", () => {
  for (const file of ["home-market-card", "market-card"])
    assert.ok(src(`components/${file}.tsx`).includes("<PredictionMarketCard"));
  const card = src("components/prediction-market-card.tsx");
  assert.ok(card.includes("market.outcomes.length === 3 ? 3 : 2"));
  assert.ok(card.includes("tp-market-card tp-card"));
  assert.ok(card.includes("marketSection(market)"));
  assert.ok(!card.includes("Math.random"));
});
test("Home omits marked duration toolbar; all durations remain on detailed view", () => {
  const s = src("components/up-down-section.tsx");
  assert.match(s, /detailed && \(/);
  assert.ok(s.includes("DURATIONS.map"));
  assert.ok(s.includes("window={w} summary"));
});
test("Selected-window chart never falls back to a different day or invents missing points", () => {
  const p = [
    { time: 900, price: 90 },
    { time: 1000, price: 100 },
    { time: 1500, price: 101 },
    { time: 2100, price: 103 },
    { time: 1200, price: NaN },
    { time: 1400, price: -2 },
  ];
  assert.deepEqual(chartWindow(p, 1000, 2000), [
    { time: 1000, price: 100 },
    { time: 1500, price: 101 },
  ]);
  assert.deepEqual(chartWindow(p, 3000, 4000), []);
  assert.deepEqual(chartWindow(p, 1450, 1600), [{ time: 1500, price: 101 }]);
});
test("Marked duplicate price, history fallback and paragraph stack are absent", () => {
  const c = src("components/updown/coingecko-chart.tsx");
  for (const text of ["Recent history", "Source details", "cg-chart-heading", "minutes: 1440"])
    assert.ok(!c.includes(text));
  assert.ok(c.includes("price chart"));
  assert.ok(c.includes("beat={boundary}"));
  assert.ok(c.includes("summary = false"));
});
test("Admin-created BNB and long-duration detail charts support locked market times", () => {
  assert.ok(src("components/prediction-detail.tsx").includes('"bnb"'));
  const c = src("components/crypto-detail-chart.tsx");
  assert.ok(c.includes("Date.parse(startsAt"));
  assert.ok(c.includes("Date.parse(endsAt"));
  assert.ok(!c.includes("Math.min(Math.max(initialMinutes, 1), 60)"));
});

test("multi-outcome trade dock does not hide football Away", () => {
  const c = src("components/mobile-outcome-dock.tsx");
  assert.ok(c.includes("market.outcomes.length > 2"));
  assert.ok(c.includes("Trade ·"));
});

test("compact cards have no repeated visible provider caption", () => {
  const c = src("components/updown/coingecko-chart.tsx");
  assert.ok(!c.includes('className="cg-attribution"'));
  assert.ok(c.includes("compact={summary}"));
  assert.ok(
    src("components/updown/sections.tsx").includes(
      "Chart observations are not settlement evidence",
    ),
  );
});
test("chart is an interactive data-rendered SVG rather than a screenshot", () => {
  const c = src("components/updown/updown-chart.tsx");
  assert.ok(c.includes("compact ? 176 : 232"));
  for (const feature of [
    "onPointerDown",
    "onKeyDown",
    "ArrowLeft",
    "aria-valuetext",
    "ud-chart-probe",
  ])
    assert.ok(c.includes(feature));
  assert.ok(c.includes('const line = `M${points.join(" L")}`'));
  assert.ok(!c.includes("<img"));
  assert.ok(!c.includes("Math.random"));
});

test("removing repeated provider captions does not hide stale-data warnings", () => {
  const c = src("components/updown/coingecko-chart.tsx");
  assert.ok(c.includes("snapshot.data?.stale"));
  assert.ok(c.includes("Delayed prices"));
});

test("reference price windows do not masquerade as live prediction trading", () => {
  const s = src("components/up-down-section.tsx");
  assert.ok(s.includes("Reference price window only"));
  assert.ok(s.includes("const poolOn = false"));
  assert.ok(!s.includes(">LIVE "));
});
