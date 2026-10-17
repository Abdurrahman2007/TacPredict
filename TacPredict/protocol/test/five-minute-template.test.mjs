import test from "node:test";
import assert from "node:assert/strict";
import { fiveMinuteTemplate } from "../../src/lib/protocol/five-minute-market.mjs";
for (const asset of ["bitcoin", "ethereum"])
  test(`${asset}: real five-minute draft never invents an observed price`, () => {
    const now = Date.parse("2026-10-16T17:42:31Z"),
      t = fiveMinuteTemplate(asset, now);
    const start = Date.parse(t.times.openAt + "Z"),
      end = Date.parse(t.times.closeAt + "Z");
    assert.equal(end - start, 300000);
    assert.equal(start % 300000, 0);
    assert.ok(start >= now + 120000);
    assert.ok(t.rules.includes("Missing, inconsistent or disputed"));
    assert.ok(t.rules.includes("Coinbase"));
    assert.equal(t.outcomes, "Up,Down");
    assert.ok(!("price" in t));
    assert.ok(t.sourceUrl.startsWith("https://api.exchange.coinbase.com/"));
  });
test("unsupported asset and clock rejected", () => {
  assert.throws(() => fiveMinuteTemplate("doge"));
  assert.throws(() => fiveMinuteTemplate("bitcoin", NaN));
});
