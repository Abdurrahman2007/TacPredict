import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("Up/Down uses the shared full screen order UI, not a truncated legacy popup", () => {
  const t = src("components/updown/trade-bar.tsx");
  assert.ok(t.includes("pd-trade-screen"));
  assert.ok(t.includes("translate-x-0 translate-y-0"));
  assert.ok(t.includes("UpDownIslandContent"));
  assert.ok(t.includes("DialogClose"));
  assert.ok(!t.includes("max-h-[calc(100dvh-80px)]"));
});
test("price-only windows open a clearly non-native preview without executable odds", () => {
  const t = src("components/updown/updown-detail.tsx"),
    card = src("components/prediction-amount-card.tsx");
  const reference = t.slice(t.indexOf("const reference: Market"), t.indexOf("if (!nowMs)"));
  assert.ok(reference.includes("probabilityKnown: false"));
  assert.ok(!reference.includes("native:"));
  assert.ok(reference.includes("No executable quote or settlement contract"));
  assert.ok(card.includes("deployment?.tradingEnabled"));
  assert.ok(card.includes('market.native?.status === "OPEN"'));
  assert.ok(card.includes("Date.parse(market.native.closeAt) > Date.now()"));
});
test("all engine durations route correctly and hydration uses a stable placeholder", () => {
  assert.ok(src("routes/up-down_.$asset.tsx").includes("DURATIONS.includes(d)"));
  assert.ok(
    src("lib/updown/use-clock.ts").includes("useSyncExternalStore(subscribe, snapshot, () => 0)"),
  );
  assert.ok(src("components/updown/updown-detail.tsx").includes("Loading price window"));
});
test("private up/down positions remain isolated by chain-aware market ID and chain", () => {
  const t = src("components/updown/sections.tsx");
  assert.ok(
    t.includes("p.marketId === market.native?.marketId && p.chainId === market.native?.chainId"),
  );
  assert.ok(
    t.includes("a.marketId === market.native?.marketId && a.chainId === market.native?.chainId"),
  );
});
