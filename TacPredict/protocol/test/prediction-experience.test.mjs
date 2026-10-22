import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("all market types share the reference detail and trade screen", () => {
  for (const f of [
    "components/preview-market-detail.tsx",
    "components/discovered-events.tsx",
    "routes/markets.$marketId.tsx",
  ])
    assert.ok(src(f).includes("PredictionDetail"), f);
  const page = src("components/prediction-detail.tsx");
  assert.ok(page.includes("IntersectionObserver"));
  assert.ok(page.includes("DialogClose"));
  assert.ok(page.includes("translate-x-0"));
  assert.ok(page.includes("market.outcomes.length > 2")); // no duplicate binary rows
  assert.ok(page.includes("p.marketId === market.native?.marketId")); // portfolio RPC returns the chain-aware API market ID
  assert.ok(page.includes("p.chainId === market.native?.chainId"));
});
test("Sell retains owned-share execution and explicit approval acknowledgement", () => {
  const ui = src("components/prediction-amount-card.tsx"),
    execution = src("lib/protocol/execution.ts");
  assert.ok(ui.includes("placeLimitSell"));
  assert.ok(ui.includes("!validSell || !ack"));
  assert.ok(ui.includes("Limit price per share"));
  assert.ok(ui.includes("No short selling"));
  assert.ok(execution.includes("Insufficient owned outcome shares"));
  assert.ok(execution.includes("Verified runtime bytecode mismatch"));
});
test("opening is SSR-safe, session-once, reduced-motion aware and storage-failure tolerant", () => {
  const ui = src("components/brand-intro.tsx");
  assert.ok(ui.includes("useState(false)"));
  assert.ok(ui.includes("prefers-reduced-motion"));
  assert.ok(ui.includes("BrandMark"));
  assert.ok(!/localStorage|Math.random/.test(ui));
  assert.ok(ui.includes("sessionStorage.getItem"));
  assert.ok(ui.includes("catch"));
  assert.ok(ui.includes("Skip intro"));
});
test("release helper retains AI and scheduled discovery without exporting server secrets", () => {
  const text = readFileSync(
    new URL("../../scripts/prepare-workers-deploy.cjs", import.meta.url),
    "utf8",
  );
  assert.ok(text.includes("entry.mjs"));
  assert.ok(text.includes('binding: "AI"'));
  assert.ok(text.includes("*/15 * * * *"));
  assert.ok(text.includes("keep_vars: true"));
  assert.ok(!text.includes("process.env.SUPABASE_SERVICE_ROLE_KEY"));
  assert.ok(!text.includes("process.env.COINGECKO_DEMO_API_KEY"));
});
