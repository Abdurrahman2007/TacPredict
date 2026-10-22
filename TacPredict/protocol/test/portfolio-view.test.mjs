import test from "node:test";
import assert from "node:assert/strict";
import {
  money,
  visiblePositions,
  remainingShares,
} from "../../src/lib/protocol/portfolio-view.mjs";
test("USDC formatting stays exact beyond Number precision and distinguishes unknown", () => {
  assert.equal(money("12345678901234567890123456789"), "$12,345,678,901,234,567,890,123.45");
  assert.equal(money("0"), "$0.00");
  assert.equal(money(null), "Unavailable");
  assert.equal(money(null, true), "••••");
  assert.throws(() => money("-1"));
});
test("only Base positions, real sort, search and active filter", () => {
  const p = (id, value, chain = 8453, status = "OPEN") => ({
    id,
    title: id,
    chainId: chain,
    status,
    valueAtomic: value,
    sharesAtomic: "1",
    updatedAt: "2026-10-11",
  });
  const rows = [
    p("Bitcoin", "9007199254740993"),
    p("Ethereum", "9007199254740992"),
    p("Unknown", null),
    p("Other", "100000", 84532),
    p("Closed", "7", 8453, "RESOLVED"),
  ];
  assert.deepEqual(
    visiblePositions(rows, "", "value", true, true).map((p) => p.id),
    ["Bitcoin", "Ethereum", "Unknown"],
  );
  assert.equal(visiblePositions(rows, "ethereum")[0].id, "Ethereum");
  assert.equal(rows.length, 5);
});
test("partial fills use atomic strings and never negative remaining", () => {
  assert.equal(remainingShares("10000000", "3000000"), "7000000");
  assert.throws(() => remainingShares("1", "2"));
});
