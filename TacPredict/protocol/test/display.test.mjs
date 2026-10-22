import test from "node:test";
import assert from "node:assert/strict";
import {
  usdcShort,
  dollarsShort,
  pct,
  cents,
  volumeText,
  sharesShort,
} from "../../src/lib/protocol/display.mjs";

test("USDC short text is exact known values; missing or malformed is unavailable", () => {
  assert.equal(usdcShort(null), "Unavailable");
  assert.equal(usdcShort(undefined), "Unavailable");
  assert.equal(usdcShort("0"), "$0");
  assert.equal(usdcShort("abc"), "Unavailable");
  assert.equal(usdcShort("592000000"), "$592");
  assert.equal(usdcShort("1234560000"), "$1,234.56");
  assert.equal(usdcShort("500000"), "$0.50");
  assert.equal(usdcShort("123"), "<$0.01");
  assert.equal(usdcShort("1250000000000"), "$1.25M");
  assert.equal(usdcShort("2000000000000"), "$2M");
  assert.equal(usdcShort(5_000_000n), "$5");
  assert.equal(usdcShort(-1n), "Unavailable");
});
test("number dollars", () => {
  assert.equal(dollarsShort(0), "$0");
  assert.equal(dollarsShort(NaN), "Unavailable");
  assert.equal(dollarsShort(12.5), "$12.50");
  assert.equal(dollarsShort(4200), "$4,200");
});
test("probabilities and prices distinguish unknown from a genuine zero", () => {
  assert.equal(pct({ probability: 74.6, probabilityKnown: true }), "75%");
  assert.equal(pct({ probability: 0, probabilityKnown: false }), "Unavailable");
  assert.equal(pct(undefined), "Unavailable");
  assert.equal(cents({ probability: 41, probabilityKnown: true }), "41¢");
  assert.equal(cents({ probability: 41, probabilityKnown: false }), "Unavailable");
});
test("volume text and shares", () => {
  assert.equal(volumeText("—"), "Unavailable");
  assert.equal(volumeText("--"), "Unavailable");
  assert.equal(volumeText(""), "Unavailable");
  assert.equal(volumeText("$1,200"), "$1,200");
  assert.equal(sharesShort("1500000"), "1.5");
  assert.equal(sharesShort("2000000"), "2");
  assert.equal(sharesShort(null), "Unavailable");
});

test("real zero odds and tiny amounts remain distinct from missing data", () => {
  assert.equal(pct({ probability: 0, probabilityKnown: true }), "0%");
  assert.equal(pct({ probability: Infinity }), "Unavailable");
  assert.equal(cents({ probability: 101 }), "Unavailable");
  assert.equal(dollarsShort(0.001), "<$0.01");
});
