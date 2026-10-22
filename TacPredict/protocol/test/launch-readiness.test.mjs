import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assessLaunchReadiness } from "../scripts/launch-readiness-core.mjs";
import {
  selectedWalletSummary,
  filterPortfolioPositions,
} from "../../src/lib/protocol/portfolio-view.mjs";
const a = "0x" + "a".repeat(40),
  b = "0x" + "b".repeat(40);
test("unknown review, liquidity, indexer and E2E remain release blockers", () => {
  const r = assessLaunchReadiness({
    chainId: 8453,
    canonical: true,
    nativeUsdc: true,
    runtimeMatches: true,
    guardian: true,
    hasOpenMarket: true,
    hasCollateral: true,
    unpaused: true,
  });
  assert.equal(r.ready, false);
  assert.equal(r.writesPerformed, false);
  for (const id of [
    "executable-liquidity",
    "independent-review",
    "funded-mainnet-e2e",
    "database-activation",
    "indexer-freshness",
  ])
    assert.equal(r.checks.find((c) => c.id === id).status, "unknown");
});
test("a flag or wrong chain cannot claim a live release", () => {
  assert.equal(
    assessLaunchReadiness({ chainId: 1, unpaused: true, databaseEnabled: true }).ready,
    false,
  );
  assert.equal(
    assessLaunchReadiness({ chainId: 8453, unpaused: false }).checks.find(
      (c) => c.id === "trading-state",
    ).status,
    "blocked",
  );
});
test("selected wallet totals exclude other wallets, other chains and wallet cash", () => {
  const p = (wallet, chainId = 8453, valueAtomic = "1000000") => ({
    wallet,
    chainId,
    valueAtomic,
    claimableAtomic: "1000000",
  });
  const r = selectedWalletSummary(
    [p(a), p(b), p(a, 84532)],
    a.toUpperCase().replace("0X", "0x"),
    [a],
    true,
  );
  assert.equal(r.markedAtomic, 1000000n);
  assert.equal(r.claimableAtomic, 1000000n);
  assert.equal(r.positions.length, 1);
  assert.equal(selectedWalletSummary([p(a)], b, [a], true).markedAtomic, null);
  assert.equal(selectedWalletSummary([], a, [a], false).markedAtomic, null);
  assert.equal(selectedWalletSummary([], a, [a], true).markedAtomic, 0n);
  assert.equal(selectedWalletSummary([p(a, 8453, null)], a, [a], true).markedAtomic, null);
});
test("category/status/UTC updated filters use real fields and do not mutate rows", () => {
  const rows = [
    { marketId: "one", status: "OPEN", updatedAt: "2026-10-22T01:00:00Z" },
    { marketId: "two", status: "VOID", updatedAt: "2026-10-20T01:00:00Z" },
  ];
  const markets = [
    { marketId: "one", category: "Sports", subcategory: "Football" },
    { marketId: "two", category: "Crypto", subcategory: null },
  ];
  assert.equal(filterPortfolioPositions(rows, markets, "Football", "Open", "2026-10-21").length, 1);
  assert.equal(filterPortfolioPositions(rows, markets, "Cricket").length, 0);
  assert.equal(filterPortfolioPositions(rows, markets, "Crypto", "Closed").length, 1);
  assert.equal(rows.length, 2);
});
test("recovery cancellation is simulated, maker-only, and not blocked by new-risk pause", () => {
  const source = fs.readFileSync(
    new URL("../../src/lib/protocol/execution.ts", import.meta.url),
    "utf8",
  );
  const cancel = source.slice(
    source.indexOf("export async function cancelSignedOrder"),
    source.indexOf("export async function revokeShareApproval"),
  );
  assert.match(cancel, /protocolClients\(w, d, false\)/);
  assert.match(cancel, /Only the maker/);
  assert.match(cancel, /simulateContract/);
  assert.match(cancel, /Cancellation failed/);
  const intro = fs.readFileSync(
    new URL("../../src/components/brand-intro.tsx", import.meta.url),
    "utf8",
  );
  assert.match(intro, /prefers-reduced-motion/);
  assert.match(intro, /sessionStorage.getItem/);
  assert.match(intro, /Escape/);
  assert.match(intro, /Skip intro/);
});
