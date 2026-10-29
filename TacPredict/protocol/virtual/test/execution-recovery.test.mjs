import test from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { executeVirtualTrade } from "../../../src/lib/virtual/execution.ts";
import { readPending, writePending } from "../../../src/lib/virtual/pending.ts";
const wallet = "0x" + "2".repeat(40),
  code = "0x60006000";
let n = 0;
function setup() {
  const m = new Map(),
    storage = {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => m.set(k, v),
      removeItem: (k) => m.delete(k),
    };
  const win = new EventTarget();
  win.localStorage = storage;
  globalThis.window = win;
  const locks = { request: async (_name, _options, run) => run({ name: _name }) };
  Object.defineProperty(globalThis, "navigator", { value: { locks }, configurable: true });
  const d = {
    id: "execution-test-" + n++,
    chainId: 8453,
    engine: "0x" + "1".repeat(40),
    codeHash: keccak256(code),
    enabled: true,
    startBlock: "0",
  };
  const q = {
    deployment: d,
    intent: { wallet, marketId: "1", outcome: 0, isBuy: true, input: "100", nonce: "0" },
    output: "190",
    fee: "0",
    revision: "0",
    deadline: "9999999999",
    blockNumber: "1",
    blockHash: "0x" + "a".repeat(64),
  };
  let sends = 0;
  const provider = {
    request: async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_getCode") return code;
      if (method === "eth_call") return "0x";
      if (method === "eth_sendTransaction") {
        sends++;
        assert.deepEqual(readPending(storage, d, wallet), { hash: null, intent: q.intent });
        throw Object.assign(Error("RPC transport lost after send"), { code: -32000 });
      }
      throw Error("Unexpected RPC " + method);
    },
  };
  return {
    storage,
    d,
    q,
    w: { address: wallet, chainId: 8453, provider },
    provider,
    sends: () => sends,
  };
}
test("execution persists before wallet send and ambiguous send failure cannot be retried", async () => {
  const h = setup();
  await assert.rejects(executeVirtualTrade(h.w, h.q, 190n, () => {}));
  assert.equal(h.sends(), 1);
  assert.equal(readPending(h.storage, h.d, wallet).hash, null);
  await assert.rejects(
    executeVirtualTrade(h.w, h.q, 190n, () => {}),
    /Reconcile/,
  );
  assert.equal(h.sends(), 1);
});
test("a restored hash blocks wallet execution even without an in-memory pending entry", async () => {
  const h = setup();
  writePending(h.storage, h.d, { hash: "0x" + "c".repeat(64), intent: h.q.intent });
  await assert.rejects(
    executeVirtualTrade(h.w, h.q, 190n, () => {}),
    /Reconcile/,
  );
  assert.equal(h.sends(), 0);
});
test("explicit wallet rejection clears only the no-hash attempt and permits a new prompt", async () => {
  const h = setup();
  const request = h.provider.request;
  h.provider.request = async (args) => {
    if (args.method === "eth_sendTransaction")
      throw Object.assign(Error("User rejected"), { code: 4001 });
    return request(args);
  };
  await assert.rejects(executeVirtualTrade(h.w, h.q, 190n, () => {}));
  assert.equal(readPending(h.storage, h.d, wallet), null);
  await assert.rejects(executeVirtualTrade(h.w, h.q, 190n, () => {}));
  assert.equal(readPending(h.storage, h.d, wallet), null);
});
test("missing cross-tab lock support or unavailable lock never prompts wallet", async () => {
  const h = setup();
  navigator.locks.request = async (_n, _o, run) => run(null);
  await assert.rejects(
    executeVirtualTrade(h.w, h.q, 190n, () => {}),
    /another tab/,
  );
  assert.equal(h.sends(), 0);
  navigator.locks = undefined;
  await assert.rejects(
    executeVirtualTrade(h.w, h.q, 190n, () => {}),
    /cannot safely/,
  );
  assert.equal(h.sends(), 0);
});
