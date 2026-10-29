import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readPending,
  writePending,
  clearPending,
  pendingKey,
  isExplicitWalletRejection,
} from "../../../src/lib/virtual/pending.ts";
const d = { id: "review", chainId: 31337, engine: "0x" + "a".repeat(40) };
const wallet = "0x" + "b".repeat(40),
  hash = "0x" + "c".repeat(64);
const intent = { wallet, marketId: "1", outcome: 0, isBuy: true, input: "1000000", nonce: "0" };
function store() {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
test("pending intent survives a reload; hash is a recovery hint, not a receipt", () => {
  const s = store();
  writePending(s, d, { hash: null, intent });
  assert.deepEqual(readPending(s, d, wallet), { hash: null, intent });
  writePending(s, d, { hash, intent });
  assert.deepEqual(readPending(s, d, wallet), { hash, intent });
  assert.equal(readPending(s, { ...d, chainId: 84532 }, wallet), null);
  assert.equal(readPending(s, { ...d, engine: "0x" + "d".repeat(40) }, wallet), null);
  assert.equal(readPending(s, d, "0x" + "e".repeat(40)), null);
});
test("unknown, invalid and reorged observations never release a pending hash", () => {
  const s = store();
  writePending(s, d, { hash, intent });
  for (const status of ["pending", "invalid", "reorged", "timeout", ""])
    assert.equal(clearPending(s, d, wallet, hash, status), false);
  assert.equal(clearPending(s, d, wallet, "0x" + "d".repeat(64), "confirmed"), false);
  assert.ok(readPending(s, d, wallet));
  for (const status of ["confirmed", "finalized", "reverted"]) {
    writePending(s, d, { hash, intent });
    assert.equal(clearPending(s, d, wallet, hash, status), true);
    assert.equal(readPending(s, d, wallet), null);
  }
});
test("corrupt, foreign or oversized recovery records fail closed", () => {
  const s = store(),
    k = pendingKey(d, wallet);
  for (const value of [
    "{",
    "null",
    "x".repeat(2049),
    JSON.stringify({ hash, intent: { ...intent, wallet: "0x" + "e".repeat(40) } }),
    JSON.stringify({ hash: "bad", intent }),
    JSON.stringify({ hash, intent: { ...intent, input: "-1" } }),
  ]) {
    s.setItem(k, value);
    assert.throws(() => readPending(s, d, wallet), /requires review/);
    assert.equal(s.getItem(k), value);
  }
});
test("unavailable or silently dropping storage cannot permit a submission", () => {
  assert.throws(() =>
    writePending(
      {
        setItem() {
          throw Error("disabled");
        },
      },
      d,
      { hash, intent },
    ),
  );
  assert.throws(
    () =>
      writePending(
        {
          setItem() {},
          getItem() {
            return null;
          },
        },
        d,
        { hash, intent },
      ),
    /unavailable/,
  );
});
test("only explicit wallet rejection is safely retryable without a hash", () => {
  assert.equal(isExplicitWalletRejection({ cause: { code: 4001 } }), true);
  for (const error of [
    new Error("timeout"),
    "rejected",
    { code: -32000 },
    null,
    { message: "user rejected" },
  ])
    assert.equal(isExplicitWalletRejection(error), false);
  const cyclic = {};
  cyclic.cause = cyclic;
  assert.equal(isExplicitWalletRejection(cyclic), false);
});
