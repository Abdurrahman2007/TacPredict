import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL("../../src/" + p, import.meta.url), "utf8");
test("Rewards remains a header route without duplicate public navigation", () => {
  const shell = read("components/app-shell.tsx");
  const nav = shell.slice(shell.indexOf("const navItems"), shell.indexOf("export function"));
  assert.equal((nav.match(/to:/g) || []).length, 4);
  assert(!nav.includes('"/rewards"'));
  assert(shell.includes('to="/rewards"'));
  assert(shell.includes("grid-cols-4"));
});
test("Preview cards and detail have no invented financial observations", () => {
  const s = read("components/prelaunch-markets.tsx");
  assert.equal((s.match(/probabilityKnown: false/g) || []).length, 2);
  assert(s.includes('volume: "$0"'));
  assert(!s.includes("native:"));
  const detail = read("components/preview-market-detail.tsx");
  assert(detail.includes("No on-chain market ID yet"));
  assert(detail.includes("No funds move."));
  assert(!detail.includes("placeLimitBuy"));
  assert(!detail.includes("fillOffer"));
  assert(!detail.includes("sendTransaction"));
  assert(detail.includes("disabled"));
  assert(detail.includes("MobileOutcomeDock"));
});
test("Unknown outcome probability never draws a fake progress bar and never shows a dash", () => {
  const row = read("components/outcome-row.tsx");
  assert(row.includes("outcome.probabilityKnown === false"));
  assert(row.includes("pct(outcome)"));
  assert(read("components/probability-history.tsx").includes("pct(o)"));
  for (const f of ["outcome-row", "probability-history", "market-card", "home-market-card"])
    assert(!/>\s*—\s*</.test(read(`components/${f}.tsx`)), `${f} must not render a dash`);
});
