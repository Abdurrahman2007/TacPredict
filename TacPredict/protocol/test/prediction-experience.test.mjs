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
test("opening the app is direct and has no decorative intro overlay", () => {
  const shell = src("components/app-shell.tsx");
  assert.ok(!shell.includes("BrandIntro"));
  assert.ok(!shell.includes("prediction-intro"));
  assert.ok(shell.includes("<BrandMark"));
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
