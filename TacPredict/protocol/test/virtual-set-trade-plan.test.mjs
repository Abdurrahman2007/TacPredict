import assert from "node:assert/strict";
import test from "node:test";
import {
  APPROVE_AMOUNT,
  errorText,
  isRejection,
  neededApprovals,
  quoteGapCents,
  quoteLifeSec,
  quoteTooFar,
  reasonText,
  sharesToAtomic,
  toAtomic,
} from "../../src/lib/virtual-set/trade-plan.mjs";

test("typed amounts become exact atomic units", () => {
  assert.equal(toAtomic("12"), 12_000_000n);
  assert.equal(toAtomic("12.5"), 12_500_000n);
  assert.equal(toAtomic("0.01"), 10_000n);
  assert.equal(toAtomic("1.000001"), 1_000_001n);
  for (const bad of ["", "abc", "1.2345678", "-1", "1e3", " 1", "1,5", 5, null]) assert.equal(toAtomic(bad), null);
});

test("share balances read from the chain round back exactly", () => {
  assert.equal(sharesToAtomic(1234.567891), 1_234_567_891n);
  assert.equal(sharesToAtomic(0.000001), 1n);
  assert.equal(sharesToAtomic(Number(2_000_000_000n) / 1e6), 2_000_000_000n);
  assert.equal(sharesToAtomic(0), null);
  assert.equal(sharesToAtomic(Number.NaN), null);
});

test("a quote is held back only when it is far from the page price", () => {
  assert.equal(quoteGapCents(550_000, 52), 3);
  assert.equal(quoteTooFar(550_000, 52), false);
  assert.equal(quoteTooFar(700_000, 52), true);
  assert.equal(quoteTooFar(700_000, null), false);
  assert.equal(quoteTooFar(700_000, Number.NaN), false);
  assert.equal(quoteLifeSec(1_000_030, 1_000_000), 30);
});

test("buys approve virtual USDC once, sells approve shares once", () => {
  assert.deepEqual(neededApprovals({ side: "buy", cost: 5_000_000n, allowance: 0n, approvedForAll: false }), ["usdc"]);
  assert.deepEqual(neededApprovals({ side: "buy", cost: 5_000_000n, allowance: APPROVE_AMOUNT, approvedForAll: false }), []);
  assert.deepEqual(neededApprovals({ side: "buy", cost: 5_000_000n, allowance: 5_000_000n, approvedForAll: false }), []);
  assert.deepEqual(neededApprovals({ side: "sell", cost: 0n, allowance: 0n, approvedForAll: false }), ["shares"]);
  assert.deepEqual(neededApprovals({ side: "sell", cost: 0n, allowance: 0n, approvedForAll: true }), []);
});

test("wallet rejections and revert messages read plainly", () => {
  assert.equal(isRejection({ code: 4001 }), true);
  assert.equal(isRejection(new Error("User rejected the request.")), true);
  assert.equal(isRejection(new Error("execution reverted")), false);
  assert.equal(errorText({ code: 4001 }), "Cancelled in your wallet");
  assert.equal(errorText(new Error("insufficient funds for gas * price + value")), "Not enough ETH on Base for network fees");
  assert.equal(errorText(new Error("execution reverted: Order expired")), "That price expired — try again");
  assert.equal(errorText(new Error("execution reverted")), "The price moved — try again");
  assert.equal(errorText(new Error("x".repeat(300))), "Trade failed — try again");
  assert.match(reasonText("not_ready"), /Preparing/);
  assert.match(reasonText("nope"), /unavailable/);
});
