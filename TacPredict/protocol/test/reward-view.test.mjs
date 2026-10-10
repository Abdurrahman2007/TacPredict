import test from "node:test";
import assert from "node:assert/strict";
import { rewardView } from "../../src/lib/reward-view.ts";
const partial = {
  account_created: true,
  x_connected: false,
  deposit_usdc: 0,
  predictions: 0,
  eligible: false,
  locked_credit: 0,
};
test("signed out, unknown and failed verification never mark progress complete", () => {
  for (const v of [
    rewardView(undefined, false, false),
    rewardView(undefined, true, false),
    rewardView(
      {
        ...partial,
        deposit_usdc: 5,
        predictions: 4,
        x_connected: true,
        eligible: true,
        locked_credit: 15,
      },
      true,
      true,
    ),
  ]) {
    assert.equal(v.complete, 0);
    assert.equal(v.earned, false);
    assert.equal(v.verified, false);
  }
});
test("X linking is next before unavailable onchain launch", () => {
  const v = rewardView(partial, true, false);
  assert.equal(v.complete, 1);
  assert.equal(v.next, "x");
  assert.equal(v.earned, false);
});
test("requirements alone do not fabricate recorded credit", () => {
  const v = rewardView(
    { ...partial, deposit_usdc: 5, predictions: 4, x_connected: true, eligible: true },
    true,
    false,
  );
  assert.equal(v.complete, 4);
  assert.equal(v.earned, false);
});
test("only fully verified recorded credit displays earned", () => {
  const v = rewardView(
    {
      ...partial,
      deposit_usdc: 5,
      predictions: 4,
      x_connected: true,
      eligible: true,
      locked_credit: 15,
    },
    true,
    false,
  );
  assert.equal(v.earned, true);
  assert.equal(v.next, "complete");
});

test("previously recorded credit remains visible if X is later unlinked", () => {
  const v = rewardView(
    { ...partial, deposit_usdc: 5, predictions: 4, eligible: false, locked_credit: 15 },
    true,
    false,
  );
  assert.equal(v.earned, true);
  assert.equal(v.complete, 3);
  assert.equal(v.next, "complete");
});
