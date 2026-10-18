/** Reference-model examples ONLY: no fee contract, fee execution, rewards or sweep activation. */
import test from "node:test";
import assert from "node:assert/strict";
const SCALE = 1000000n;
const payout = (balances, weights, denominator) =>
  balances.reduce((n, b, i) => n + b * weights[i], 0n) / denominator;
const proposedFee = (before, cost) => ((before + cost) * 100n) / 10000n - (before * 100n) / 10000n;

test("$80 YES / $40 NO turnover does not become treasury collateral or revenue", () => {
  const collateral = 100n * SCALE,
    yesNotional = 80n * SCALE,
    noNotional = 40n * SCALE;
  assert.equal(yesNotional + noNotional, 120n * SCALE);
  const yesClaims = payout([100n * SCALE, 0n], [1n, 0n], 1n);
  assert.equal(yesClaims, collateral);
  assert.equal(collateral - yesClaims, 0n);
  assert.equal(yesNotional + noNotional - collateral, 20n * SCALE); // maker P&L, NOT protocol fee
  assert.equal(payout([100n * SCALE, 0n], [1n, 1n], 2n), 50n * SCALE);
  assert.notEqual(50n * SCALE, yesNotional);
});
test("1% proposed buyer surcharge conserves cash and does not consume collateral", () => {
  const before = 100n * SCALE,
    cost = 12_400_000n,
    fee = proposedFee(0n, cost);
  assert.equal(fee, 124000n);
  const buyerAfter = before - cost - fee,
    sellerReceipt = cost,
    treasuryReceipt = fee;
  assert.equal(buyerAfter + sellerReceipt + treasuryReceipt, before);
  assert.equal(proposedFee(0n, 0n), 0n);
});
test("cumulative proposed fee is invariant under partial execution partitions", () => {
  for (const total of [1n, 99n, 100n, 101n, 9007199254740993000000n]) {
    const pieces = [total / 7n, total / 3n, total - total / 7n - total / 3n];
    let cumulative = 0n,
      fees = 0n;
    for (const cost of pieces) {
      fees += proposedFee(cumulative, cost);
      cumulative += cost;
    }
    assert.equal(fees, proposedFee(0n, total));
  }
});
test("same-holder VOID carry conserves principal; cross-holder dust is not fee revenue", () => {
  assert.equal(payout([1n, 1n, 1n], [1n, 1n, 1n], 3n), 1n);
  const separate = [
    payout([1n, 0n, 0n], [1n, 1n, 1n], 3n),
    payout([0n, 1n, 0n], [1n, 1n, 1n], 3n),
    payout([0n, 0n, 1n], [1n, 1n, 1n], 3n),
  ];
  assert.equal(
    separate.reduce((a, b) => a + b, 0n),
    0n,
  );
  // Residual 1 atomic remains locked under V1, not authorized for treasury transfer.
});
