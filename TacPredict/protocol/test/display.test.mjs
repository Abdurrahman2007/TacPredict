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

test("USDC short text is a real figure or a plain $0, never a dash", () => {
  assert.equal(usdcShort(null), "$0");
  assert.equal(usdcShort(undefined), "$0");
  assert.equal(usdcShort("0"), "$0");
  assert.equal(usdcShort("abc"), "$0");
  assert.equal(usdcShort("592000000"), "$592");
  assert.equal(usdcShort("1234560000"), "$1,234.56");
  assert.equal(usdcShort("500000"), "$0.50");
  assert.equal(usdcShort("123"), "$0");
  assert.equal(usdcShort("1250000000000"), "$1.25M");
  assert.equal(usdcShort("2000000000000"), "$2M");
  assert.equal(usdcShort(5_000_000n), "$5");
  assert.equal(usdcShort(-1n), "$0");
});
test("number dollars", () => {
  assert.equal(dollarsShort(0), "$0");
  assert.equal(dollarsShort(NaN), "$0");
  assert.equal(dollarsShort(12.5), "$12.50");
  assert.equal(dollarsShort(4200), "$4,200");
});
test("probabilities and prices fall back to zero, not a dash", () => {
  assert.equal(pct({ probability: 74.6, probabilityKnown: true }), "75%");
  assert.equal(pct({ probability: 0, probabilityKnown: false }), "0%");
  assert.equal(pct(undefined), "0%");
  assert.equal(cents({ probability: 41, probabilityKnown: true }), "41¢");
  assert.equal(cents({ probability: 41, probabilityKnown: false }), "0¢");
});
test("volume text and shares", () => {
  assert.equal(volumeText("—"), "$0");
  assert.equal(volumeText("--"), "$0");
  assert.equal(volumeText(""), "$0");
  assert.equal(volumeText("$1,200"), "$1,200");
  assert.equal(sharesShort("1500000"), "1.5");
  assert.equal(sharesShort("2000000"), "2");
  assert.equal(sharesShort(null), "0");
});
