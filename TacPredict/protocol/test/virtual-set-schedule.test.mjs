import test from "node:test";
import assert from "node:assert/strict";
import { ASSETS } from "../../src/lib/updown/window.mjs";
import {
  OPEN_LEAD_SEC,
  PRE_OPEN_SEC,
  QUOTE_CUTOFF_SEC,
  VSET_ASSETS,
  VSET_DURATIONS,
  VSET_PRODUCTS,
  boxAmount,
  fillCostFor,
  isVsetPair,
  marketKey,
  parseMarketKey,
  plannedWindows,
  quoteBlocker,
  sharesForUsdc,
  windowOutcome,
  windowStartSec,
} from "../../src/lib/virtual-set/schedule.mjs";
import {
  RULES_HASH,
  evidenceHashFor,
  marketMetadata,
  marketTerms,
  metadataUri,
  sourceHashFor,
} from "../../src/lib/virtual-set/market-terms.mjs";
import { keccak256, stringToBytes } from "viem";

// 2026-11-07 06:03:20 UTC
const NOW = 1_794_031_400;

test("products match the page's own asset list, so a window means the same thing everywhere", () => {
  for (const asset of VSET_ASSETS) assert.equal(VSET_PRODUCTS[asset], ASSETS[asset].product);
  assert.deepEqual([...VSET_DURATIONS], [5, 15]);
});

test("market keys are the ids the page already uses and parse back", () => {
  const start = windowStartSec(NOW, 5);
  assert.equal(start % 300, 0);
  const key = marketKey("bitcoin", start * 1000, 5);
  assert.equal(key, `reference-bitcoin-${start * 1000}-5`);
  assert.deepEqual(parseMarketKey(key), { asset: "bitcoin", startMs: start * 1000, minutes: 5 });
  assert.equal(parseMarketKey("reference-bitcoin-1-5"), null);
  assert.equal(parseMarketKey(`reference-bitcoin-${(start + 1) * 1000}-5`), null, "start must sit on the clock grid");
  assert.equal(parseMarketKey(`reference-xrp-${start * 1000}-5`), null);
  assert.equal(parseMarketKey(`reference-bitcoin-${start * 1000}-30`), null, "30m is not on chain yet");
  assert.equal(parseMarketKey(42), null);
  assert.equal(isVsetPair("solana", 15), true);
  assert.equal(isVsetPair("solana", 30), false);
  assert.equal(isVsetPair("xrp", 5), false);
});

test("the keeper prepares the running window and the next ones, never in the past", () => {
  const five = plannedWindows(NOW, "ethereum", 5);
  assert.equal(five.length, 3);
  const start = windowStartSec(NOW, 5);
  assert.deepEqual(
    five.map((w) => w.startSec),
    [start, start + 300, start + 600],
  );
  for (const w of five) {
    assert.equal(w.endSec - w.startSec, 300);
    assert.ok(w.openAtSec >= NOW + OPEN_LEAD_SEC, "opens after the create transaction can land");
    assert.ok(w.openAtSec >= w.startSec - PRE_OPEN_SEC && w.openAtSec < w.endSec);
  }
  assert.equal(five[1].openAtSec, five[1].startSec - PRE_OPEN_SEC, "a future window opens a little early so it can be stocked");
  assert.equal(plannedWindows(NOW, "bnb", 15).length, 2);
  assert.deepEqual(plannedWindows(NOW, "bnb", 60), []);
});

test("a window that has almost run out is skipped rather than opened for a few seconds", () => {
  const start = windowStartSec(NOW, 5);
  const late = start + 300 - 20;
  const windows = plannedWindows(late, "bitcoin", 5);
  assert.ok(!windows.some((w) => w.startSec === start));
  assert.equal(windows[0].startSec, start + 300);
});

test("Up when the last candle closes above the first open, Down below, a tie voids", () => {
  assert.deepEqual(windowOutcome(100, 100.01), { outcome: 0, voided: false });
  assert.deepEqual(windowOutcome(100, 99.99), { outcome: 1, voided: false });
  assert.deepEqual(windowOutcome(100, 100), { outcome: 0, voided: true });
  assert.equal(windowOutcome(0, 100), null);
  assert.equal(windowOutcome(100, Number.NaN), null);
  assert.equal(windowOutcome(100, undefined), null);
});

test("quotes are refused unless the market is created, funded, priced, open and not closing", () => {
  const base = {
    market_id: 7,
    inventory_ready: true,
    strike: 100,
    failed: false,
    open_at: new Date((NOW - 60) * 1000).toISOString(),
    start_at: new Date((NOW - 30) * 1000).toISOString(),
    end_at: new Date((NOW + 200) * 1000).toISOString(),
  };
  assert.equal(quoteBlocker(base, NOW), null);
  assert.equal(quoteBlocker(null, NOW), "no_market");
  assert.equal(quoteBlocker({ ...base, failed: true }, NOW), "market_failed");
  assert.equal(quoteBlocker({ ...base, market_id: null }, NOW), "not_created");
  assert.equal(quoteBlocker({ ...base, inventory_ready: false }, NOW), "not_ready");
  assert.equal(quoteBlocker({ ...base, strike: null }, NOW), "no_strike");
  assert.equal(quoteBlocker({ ...base, strike: 0 }, NOW), "no_strike");
  assert.equal(quoteBlocker(base, NOW - 60), "not_open");
  assert.equal(quoteBlocker(base, NOW - 40), "not_open", "no quote before the window starts: no price to beat yet");
  assert.equal(quoteBlocker(base, NOW + 200 - QUOTE_CUTOFF_SEC + 1), "closing");
  assert.equal(quoteBlocker({ ...base, open_at: "nope" }, NOW), "no_market");
});

test("shares and cost round the way the Exchange contract rounds", () => {
  // $10 at 60 cents buys 16.666666 shares and costs a hair under $10.
  const shares = sharesForUsdc(10_000_000n, 600_000);
  assert.equal(shares, 16_666_666n);
  assert.equal(fillCostFor(shares, 600_000), 9_999_999n);
  assert.ok(fillCostFor(shares, 600_000) <= 10_000_000n);
  assert.equal(sharesForUsdc(1_000_000n, 500_000), 2_000_000n);
  assert.throws(() => sharesForUsdc(1n, 0));
  assert.throws(() => sharesForUsdc(1n, 1_000_000));
});

test("box amounts are whole dollars from 50 to 500 with every tier reachable", () => {
  assert.equal(boxAmount(0, 0), 50);
  assert.equal(boxAmount(0.59, 0.9999), 100);
  assert.equal(boxAmount(0.7, 0), 101);
  assert.equal(boxAmount(0.9, 0.5) >= 201 && boxAmount(0.9, 0.5) <= 350, true);
  assert.equal(boxAmount(0.999, 0.9999), 500);
  for (let i = 0; i < 2000; i += 1) {
    const amount = boxAmount(Math.random(), Math.random());
    assert.ok(Number.isInteger(amount) && amount >= 50 && amount <= 500, String(amount));
  }
});

test("market terms follow the contract rules and can be recomputed from the key", () => {
  const window = plannedWindows(NOW, "solana", 15)[1];
  const { terms, metadataURI, metadata } = marketTerms(window);
  assert.equal(terms.outcomes, 2);
  assert.ok(terms.openAt >= BigInt(NOW), "Registry.create needs openAt >= now");
  assert.ok(terms.closeAt > terms.openAt);
  assert.ok(terms.resolveAfter >= terms.closeAt);
  assert.ok(terms.resolutionDeadline > terms.resolveAfter + 60n, "room for the 60 second challenge");
  for (const value of [terms.salt, terms.metadataHash, terms.rulesHash, terms.sourceHash])
    assert.match(value, /^0x[0-9a-f]{64}$/);
  assert.notEqual(terms.salt, `0x${"0".repeat(64)}`);
  assert.equal(terms.rulesHash, RULES_HASH);
  assert.equal(terms.sourceHash, sourceHashFor("solana"));
  assert.notEqual(sourceHashFor("solana"), sourceHashFor("bitcoin"));
  assert.equal(metadataURI, metadataUri(window.key));
  assert.equal(metadataURI, `https://tacpredict.fun/api/v2/market/${window.key}`);
  assert.deepEqual(metadata, marketMetadata(window.key));
  assert.equal(terms.metadataHash, keccak256(stringToBytes(JSON.stringify(marketMetadata(window.key)))));
  assert.equal(metadata.product, "SOL-USD");
  assert.equal(metadata.endSec - metadata.startSec, 900);
  // Two markets never share a salt (the Factory rejects a used salt).
  const other = marketTerms(plannedWindows(NOW, "solana", 15)[0]).terms.salt;
  assert.notEqual(other, terms.salt);
  assert.match(evidenceHashFor({ open: 1, close: 2 }), /^0x[0-9a-f]{64}$/);
  assert.throws(() => marketMetadata("reference-xrp-0-5"));
});
