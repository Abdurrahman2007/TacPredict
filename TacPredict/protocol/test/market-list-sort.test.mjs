import test from "node:test";
import assert from "node:assert/strict";
import { sortListings } from "../../src/lib/markets/listing-sort.mjs";
test("native activity uses exact real atomic volume", () => {
  const a = { id: "a", native: { volume24hAtomic: "9007199254740992" }, participants: 1 },
    b = { id: "b", native: { volume24hAtomic: "9007199254740993" }, participants: 2 };
  assert.equal(sortListings([a, b], "Most active")[0].id, "b");
});
test("ending and new sort all listing types without changing input", () => {
  const rows = [
    { id: "a", closeAt: "2026-12-01", updatedAt: "2026-10-01" },
    { id: "b", closeAt: "2026-11-01", updatedAt: "2026-10-02" },
  ];
  assert.equal(sortListings(rows, "Ending soon")[0].id, "b");
  assert.equal(sortListings(rows, "New")[0].id, "b");
  assert.equal(rows[0].id, "a");
});
test("unknown activity does not fabricate metadata rankings", () => {
  const rows = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(
    sortListings(rows).map((x) => x.id),
    ["a", "b"],
  );
});
