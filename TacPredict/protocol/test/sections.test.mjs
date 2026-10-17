import test from "node:test";
import assert from "node:assert/strict";
import { marketSection, sectionOf, termsForSection } from "../../src/domain/markets/sections.mjs";

test("only Crypto, Football and Cricket are shown", () => {
  assert.equal(sectionOf({ category: "Crypto" }), "Crypto");
  assert.equal(sectionOf({ category: "Sports", subcategory: "Football" }), "Football");
  assert.equal(sectionOf({ category: "Sports", subcategory: "Cricket" }), "Cricket");
  for (const category of ["News", "Technology", "Business", "Culture", "Other"])
    assert.equal(sectionOf({ category, title: "Football cricket" }), null);
});
test("sports without a subcategory are sorted by title, anything else is hidden", () => {
  assert.equal(sectionOf({ category: "Sports", title: "La Liga: Real Madrid vs Barcelona" }), "Football");
  assert.equal(sectionOf({ category: "Sports", title: "Bangladesh vs India T20" }), "Cricket");
  assert.equal(sectionOf({ category: "Sports", title: "NBA finals winner" }), null);
  assert.equal(sectionOf({ category: "Sports", subcategory: "Tennis", title: "Cricket" }), null);
});
test("native markets use their stored subcategory", () => {
  assert.equal(
    marketSection({ category: "Sports", title: "Anything", native: { subcategory: "Cricket" } }),
    "Cricket",
  );
  assert.equal(marketSection(null), null);
});
test("terms round-trip into a stored category plus subcategory", () => {
  assert.deepEqual(termsForSection("Crypto"), { category: "Crypto" });
  assert.deepEqual(termsForSection("Football"), { category: "Sports", subcategory: "Football" });
  assert.throws(() => termsForSection("News"));
});
