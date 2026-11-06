import test from "node:test";
import assert from "node:assert/strict";
import {
  DOWN,
  MAX_PRICE_PPM,
  MAX_TTL_SEC,
  MIN_PRICE_PPM,
  UP,
  exchangeDomain,
  fillCost,
  makerFairUpPpm,
  makerOrder,
  makerQuote,
  signMakerOrder,
  userPrice,
} from "../../src/lib/virtual-set/market-maker.mjs";

const maker = "0x1111111111111111111111111111111111111111";
const taker = "0x2222222222222222222222222222222222222222";
const exchange = "0x3333333333333333333333333333333333333333";
const sigmaPpm = 380;
const fair = (spot, remainingSec, strike = 100) => makerFairUpPpm({ spot, strike, remainingSec, sigmaPpm });

test("fair price is 50 cents at the strike and moves with the feed and the clock", () => {
  assert.equal(fair(100, 300), 500_000);
  const early = fair(100.05, 280);
  const later = fair(100.05, 20);
  const last = fair(100.05, 1);
  assert.ok(early > 500_000 && later > early && last > later, "the same lead is worth more as the clock runs out");
  assert.ok(fair(100.1, 60) > fair(100.05, 60), "a bigger lead is worth more");
  // Symmetric: the same lead below the strike is the mirror image.
  assert.ok(Math.abs(fair(100.05, 20) + fair(99.95, 20) - 1_000_000) <= 2, "mirror image, to within rounding");
});

test("the winning side reaches 99 cents in the last second and the losing side 1 cent, never beyond", () => {
  assert.equal(fair(100.2, 1), MAX_PRICE_PPM);
  assert.equal(fair(99.8, 1), MIN_PRICE_PPM);
  assert.equal(fair(1_000, 1), MAX_PRICE_PPM);
  assert.equal(fair(100.2, 300) < MAX_PRICE_PPM, true, "with five minutes left the same lead is not decisive");
});

test("unusable readings produce no price instead of a made-up one", () => {
  for (const bad of [
    { spot: 0, strike: 100, remainingSec: 10, sigmaPpm },
    { spot: 100, strike: 0, remainingSec: 10, sigmaPpm },
    { spot: 100, strike: 100, remainingSec: 0, sigmaPpm },
    { spot: 100, strike: 100, remainingSec: -5, sigmaPpm },
    { spot: Number.NaN, strike: 100, remainingSec: 10, sigmaPpm },
    { spot: 100, strike: 100, remainingSec: 10, sigmaPpm: 0 },
    { spot: undefined, strike: 100, remainingSec: 10, sigmaPpm },
  ])
    assert.equal(makerFairUpPpm(bad), null);
});

test("quotes always leave the maker an edge and give users no risk-free profit", () => {
  for (const upPpm of [MIN_PRICE_PPM, 100_000, 500_000, 733_333, 980_000, MAX_PRICE_PPM]) {
    const q = makerQuote({ upPpm });
    for (const book of [q.up, q.down]) {
      assert.ok(book.bid > 0 && book.ask < 1_000_000 && book.bid < book.ask, JSON.stringify(q));
    }
    assert.ok(q.up.ask + q.down.ask > 1_000_000, "buying both outcomes costs more than one dollar");
    assert.ok(q.up.bid + q.down.bid < 1_000_000, "selling both outcomes returns less than one dollar");
    assert.equal(q.up.bid + q.down.ask, 1_000_000);
    assert.equal(q.up.ask + q.down.bid, 1_000_000);
  }
  assert.throws(() => makerQuote({ upPpm: 5_000 }));
  assert.throws(() => makerQuote({ upPpm: 500_000, halfSpreadPpm: 0 }));
  const q = makerQuote({ upPpm: 500_000 });
  assert.equal(userPrice(q, UP, "buy"), 510_000);
  assert.equal(userPrice(q, UP, "sell"), 490_000);
  assert.equal(userPrice(q, DOWN, "buy"), 510_000);
  assert.throws(() => userPrice(q, 2, "buy"));
  assert.throws(() => userPrice(q, UP, "hold"));
});

test("a maker order is short-lived, bound to the asking wallet and never outlives the market", () => {
  const quote = makerQuote({ upPpm: 500_000 });
  const base = { marketId: 7, outcome: UP, maker, userSide: "buy", quote, shares: 10_000_000n, nonce: 1, closeAt: 1_000, now: 900, taker };
  const buy = makerOrder(base);
  assert.equal(buy.isBuy, false, "the user buys, so the maker sells");
  assert.equal(buy.price, 510_000n);
  assert.equal(buy.taker, taker);
  assert.equal(buy.expiration, 910n);
  const sell = makerOrder({ ...base, userSide: "sell" });
  assert.equal(sell.isBuy, true, "the user sells, so the maker buys");
  assert.equal(sell.price, 490_000n);
  assert.equal(makerOrder({ ...base, now: 995 }).expiration, 1_000n, "capped at the close");
  assert.throws(() => makerOrder({ ...base, now: 999 }), /closing/);
  assert.throws(() => makerOrder({ ...base, ttlSec: MAX_TTL_SEC + 1 }));
  assert.throws(() => makerOrder({ ...base, ttlSec: 0 }));
  assert.throws(() => makerOrder({ ...base, taker: "0x0000000000000000000000000000000000000000" }));
  assert.throws(() => makerOrder({ ...base, taker: maker }));
  assert.throws(() => makerOrder({ ...base, shares: 0n }));
  assert.throws(() => makerOrder({ ...base, outcome: 3 }));
});

test("orders are signed under the virtual exchange's own domain on Base only", async () => {
  const domain = exchangeDomain({ chainId: 8453, exchange });
  assert.equal(domain.name, "TacPredictVirtualExchange");
  assert.notEqual(domain.name, "TacPredictExchange");
  assert.throws(() => exchangeDomain({ chainId: 1, exchange }), /Base only/);
  assert.throws(() => exchangeDomain({ chainId: 8453, exchange: "0x123" }));
  let seen;
  const signature = await signMakerOrder(
    { signTypedData: async (args) => ((seen = args), "0xsigned") },
    domain,
    makerOrder({ marketId: 1, outcome: DOWN, maker, userSide: "buy", quote: makerQuote({ upPpm: 500_000 }), shares: 1n, nonce: 0, closeAt: 100, now: 10, taker }),
  );
  assert.equal(signature, "0xsigned");
  assert.equal(seen.primaryType, "Order");
  assert.equal(seen.types.Order.map((f) => f.name).join(","), "marketId,outcome,maker,isBuy,price,shares,nonce,expiration,taker");
});

test("fill cost matches the exchange's rounding", () => {
  assert.equal(fillCost(510_000, 10_000_000n), 5_100_000n);
  assert.equal(fillCost(333_333, 1n), 0n, "dust rounds down like the contract, which then refuses the fill");
});

test("the exchange order shape in the contract and in the signer are the same", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(new URL("../contracts/VirtualExchange.sol", import.meta.url), "utf8");
  const typehash = source.match(/Order\(([^)]*)\)/)?.[1]?.split(",").map((f) => f.trim().split(" ").reverse().join(":")).join(",");
  const { ORDER_TYPES } = await import("../../src/lib/virtual-set/market-maker.mjs");
  assert.equal(ORDER_TYPES.Order.map((f) => `${f.name}:${f.type}`).join(","), typehash);
});
