import test from "node:test";
import assert from "node:assert/strict";
import { createRequestBudget } from "../scripts/request-budget.mjs";
test("free Worker budget reserves three requests for completion and lease release", async () => {
  let actual = 0;
  const budget = createRequestBudget(12, async () => {
    actual++;
    return { ok: true };
  });
  for (let i = 0; i < 9; i++) await budget.fetch("https://fixture.invalid");
  await assert.rejects(budget.fetch("https://fixture.invalid"), /committed checkpoint/);
  assert.equal(actual, 9);
  budget.releaseReserve();
  for (let i = 0; i < 3; i++) await budget.fetch("https://fixture.invalid");
  assert.equal(actual, 12);
  await assert.rejects(budget.fetch("https://fixture.invalid"), /request budget/);
  assert.equal(budget.count(), 12);
});
test("free Worker request cap cannot be accidentally raised beyond forty-eight", () => {
  for (const n of [0, 7, 49, 500, NaN, 8.1]) assert.throws(() => createRequestBudget(n));
});
