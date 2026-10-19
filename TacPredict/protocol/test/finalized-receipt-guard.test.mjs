import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanonicalBlock,
  assertFinalizedEventReceipt,
} from "../scripts/finalized-receipt-guard.mjs";
const h = (n) => "0x" + n.repeat(64),
  a = (n) => "0x" + n.repeat(40);
function fixture() {
  const log = {
    address: a("a"),
    blockHash: h("b"),
    transactionHash: h("c"),
    blockNumber: 10n,
    transactionIndex: 2,
    logIndex: 7,
    removed: false,
    data: "0x1234",
    topics: [h("d"), h("e")],
  };
  return {
    log,
    receipt: {
      status: "success",
      transactionHash: h("c"),
      transactionIndex: 2,
      blockHash: h("b"),
      blockNumber: 10n,
      logs: [structuredClone(log)],
    },
    block: { number: 10n, hash: h("b") },
  };
}
const check = (f) => assertFinalizedEventReceipt(f.log, f.receipt, f.block, 12n);
test("complete canonical event identity passes; unrelated outer receipt logs do not imply their calls succeeded", () => {
  const f = fixture();
  f.receipt.logs.push({ ...f.log, logIndex: 9 });
  assert.equal(check(f), true);
});
test("receipt status, transaction identity and block identity must all match", () => {
  for (const patch of [
    { status: "reverted" },
    { status: "0x1" },
    { transactionHash: h("f") },
    { transactionIndex: 3 },
    { blockNumber: 11n },
    { blockHash: h("f") },
    { logs: [] },
  ]) {
    const f = fixture();
    Object.assign(f.receipt, patch);
    assert.throws(() => check(f));
  }
});
test("same-address same-data log with different indexed topics is NOT evidence", () => {
  const f = fixture();
  f.receipt.logs[0].topics[1] = h("f");
  assert.throws(() => check(f), /topics mismatch/);
});
test("each receipt log envelope must match, including removed/index/address/transaction/block/topics", () => {
  for (const patch of [
    { removed: true },
    { transactionHash: h("f") },
    { transactionIndex: 3 },
    { blockNumber: 11n },
    { blockHash: h("f") },
    { address: a("f") },
    { data: "0x5678" },
    { topics: [h("d")] },
    { logIndex: 8 },
  ]) {
    const f = fixture();
    Object.assign(f.receipt.logs[0], patch);
    assert.throws(() => check(f));
  }
});
test("duplicate event indexes reject even if one candidate matches", () => {
  const f = fixture();
  f.receipt.logs.push({ ...f.log });
  assert.throws(() => check(f), /duplicate/);
});
test("malformed/unfinalized/removed event input fails closed", () => {
  for (const patch of [
    { removed: true },
    { removed: undefined },
    { transactionHash: "0x1" },
    { blockHash: "0x1" },
    { blockNumber: 10 },
    { blockNumber: 13n },
    { logIndex: 1.2 },
    { transactionIndex: -1 },
    { data: "0x1" },
    { topics: [] },
    { topics: ["0x12"] },
  ]) {
    const f = fixture();
    Object.assign(f.log, patch);
    assert.throws(() => check(f));
  }
});
test("canonical block number/hash cannot be substituted; arbitrary head types reject", () => {
  for (const args of [
    [{ number: 11n, hash: h("b") }, 10n, 12n],
    [{ number: 10n, hash: "0x1" }, 10n, 12n],
    [{ number: 10n, hash: h("b") }, 10n, 9n],
    [{ number: 10n, hash: h("b") }, 10, 12n],
  ])
    assert.throws(() => assertCanonicalBlock(...args));
});
