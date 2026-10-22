import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("all four assets use the real CoinGecko ID and server-only key", () => {
  const s = src("lib/coingecko.server.ts");
  assert.ok(s.includes('"solana", "bnb"'));
  assert.ok(s.includes("binancecoin"));
  assert.ok(s.includes("x-cg-demo-api-key"));
  assert.ok(!s.includes("VITE_COINGECKO"));
});
test("Home and detail use CoinGecko charts without changing locked oracle evidence", () => {
  for (const f of ["components/up-down-section.tsx", "components/updown/updown-detail.tsx"])
    assert.ok(src(f).includes("<CoinGeckoChart"));
  const c = src("components/updown/coingecko-chart.tsx");
  assert.ok(c.includes("usePriceWindow(asset, selected)"));
  assert.ok(!c.includes("Recent history"));
  assert.ok(c.includes("beat={boundary}"));
  assert.ok(c.includes("evidence ? evidence.beat : feed.boundary"));
  assert.ok(c.includes("Sampled prices, not tick-by-tick"));
  assert.ok(c.includes('source={evidence?.source ?? "USD reference observations"}'));
  assert.ok(!c.includes("Math.random"));
  assert.ok(src("lib/protocol/market-templates.mjs").includes("do not substitute CoinGecko spot"));
});
test("provider status does not claim configured keys are verified live connections", () => {
  assert.ok(src("components/admin/views/engine.tsx").includes("Configured"));
  assert.ok(src("components/admin/views/engine.tsx").includes("order book, not an AMM"));
});
