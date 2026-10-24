import test from "node:test";
import assert from "node:assert/strict";
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters } from "viem";
import { virtualAmmAbi } from "../../../src/lib/virtual/abi.ts";
import { verifyTradeReceipt, projectWalletEvents } from "../../../src/lib/virtual/receipt.ts";
import { indexVirtualRange } from "../../../src/lib/virtual/indexer-core.ts";
import { pointsCandidate } from "../../../src/lib/virtual/points.ts";
const engine = "0x1111111111111111111111111111111111111111",
  wallet = "0x2222222222222222222222222222222222222222";
const hash = (n) => "0x" + n.toString(16).padStart(64, "0");
const intent = { wallet, marketId: "1", outcome: 0, isBuy: true, input: "10000000", nonce: "0" };
function receipt() {
  return {
    transactionHash: hash(4),
    status: "success",
    blockNumber: 5n,
    blockHash: hash(5),
    logs: [
      {
        address: engine,
        logIndex: 0,
        transactionHash: hash(4),
        blockNumber: 5n,
        blockHash: hash(5),
        topics: encodeEventTopics({
          abi: virtualAmmAbi,
          eventName: "TradeExecuted",
          args: { wallet, marketId: 1n, nonce: 0n },
        }),
        data: encodeAbiParameters(
          parseAbiParameters(
            "uint8,bool,uint64,uint64,uint64,uint64,uint64,uint128,int256,uint128",
          ),
          [0, true, 10000000n, 19090909n, 0n, 2n, 19090909n, 10000000n, 0n, 90000000n],
        ),
      },
    ],
  };
}
function ev(name, args, marketId = "1", n = 1) {
  return {
    name,
    args,
    marketId,
    wallet,
    txHash: hash(n),
    blockHash: hash(10),
    blockNumber: "10",
    logIndex: n,
  };
}
const grant = ev("VirtualGrant", { amount: "100000000" }, null, 0);
const buy = ev(
  "TradeExecuted",
  {
    isBuy: true,
    input: "10000000",
    output: "19090909",
    outcome: 0,
    remainingShares: "19090909",
    remainingBasis: "10000000",
    realizedPnlDelta: "0",
    cashAfter: "90000000",
  },
  "1",
  1,
);

test("receipt success plus exact trusted event; hash/signature/API result alone never confirms", () => {
  const r = receipt();
  assert.equal(verifyTradeReceipt(r, engine, intent, hash(5), 4n).status, "confirmed");
  assert.equal(verifyTradeReceipt(r, engine, intent, hash(5), 5n).status, "finalized");
  assert.throws(() => verifyTradeReceipt({ ...r, logs: [] }, engine, intent, hash(5), 5n));
  for (const field of ["wallet", "input", "nonce", "marketId"])
    assert.throws(() =>
      verifyTradeReceipt(
        r,
        engine,
        { ...intent, [field]: field === "wallet" ? engine : "999" },
        hash(5),
        5n,
      ),
    );
  assert.throws(() =>
    verifyTradeReceipt(
      { ...r, logs: [...r.logs, { ...r.logs[0], logIndex: 1 }] },
      engine,
      intent,
      hash(5),
      5n,
    ),
  );
  assert.throws(() =>
    verifyTradeReceipt(
      { ...r, logs: [{ ...r.logs[0], address: wallet }] },
      engine,
      intent,
      hash(5),
      5n,
    ),
  );
  assert.equal(
    verifyTradeReceipt({ ...r, status: "reverted" }, engine, intent, hash(5), 5n).status,
    "reverted",
  );
  assert.equal(verifyTradeReceipt(r, engine, intent, hash(6), 5n).status, "reorged");
});
test("wallet projection is exact, isolated, idempotent and fail closed on missing history", () => {
  const result = projectWalletEvents([grant, buy, buy], wallet);
  assert.equal(result.balance, "90000000");
  assert.equal(result.positions[0].basis, "10000000");
  assert.equal(result.trades.length, 1);
  assert.throws(() => projectWalletEvents([buy], wallet));
  assert.throws(() => projectWalletEvents([grant], engine));
  const settle = ev(
    "PositionSettled",
    { payout: "19090909", realizedPnlDelta: "9090909", cashAfter: "109090909" },
    "1",
    2,
  );
  const final = projectWalletEvents([grant, buy, settle], wallet);
  assert.equal(final.balance, "109090909");
  assert.equal(final.realizedPnl, "9090909");
  assert.equal(final.positions[0].shares, "0");
  assert.throws(() => projectWalletEvents([grant, buy, { ...buy, logIndex: 9 }], wallet));
});
function harness() {
  let cursor = { number: 0n, hash: hash(100), finalized: 0n, start: 1n };
  const saved = new Map([[0n, hash(100)]]),
    blocks = new Map();
  for (let n = 0n; n < 5n; n++)
    blocks.set(n, {
      number: n,
      hash: hash(Number(n) + 100),
      parentHash: hash(Number(n) + 99),
      timestamp: n,
    });
  const journals = [];
  return {
    blocks,
    saved,
    journals,
    get cursor() {
      return cursor;
    },
    setCursor: (c) => {
      cursor = c;
    },
    rpc: {
      block: async (n) => blocks.get(n),
      head: async () => 4n,
      finalized: async () => blocks.get(2n),
      receipts: async () => [],
    },
    store: {
      cursor: async () => cursor,
      blockHash: async (n) => saved.get(n) ?? null,
      rewind: async (n, h) => {
        if (n < cursor.finalized) throw Error();
        journals.push(["rewind", n]);
        for (const k of saved.keys()) if (k > n) saved.delete(k);
        cursor = { ...cursor, number: n, hash: h };
      },
      commit: async (b, events, expected) => {
        assert.equal(expected, cursor.number);
        journals.push(["commit", b.number]);
        saved.set(b.number, b.hash);
        cursor = { ...cursor, number: b.number, hash: b.hash };
      },
      finalize: async (n) => {
        cursor.finalized = n;
      },
    },
  };
}
test("indexer commits contiguous blocks, reconciles provisional reorg and preserves finality", async () => {
  const h = harness();
  await indexVirtualRange(h.rpc, h.store, engine, 4);
  assert.equal(h.cursor.number, 4n);
  assert.equal(h.cursor.finalized, 2n);
  h.blocks.set(3n, { ...h.blocks.get(3n), hash: hash(203) });
  h.blocks.set(4n, { ...h.blocks.get(4n), hash: hash(204), parentHash: hash(203) });
  await indexVirtualRange(h.rpc, h.store, engine, 4);
  assert(h.journals.some((j) => j[0] === "rewind" && j[1] === 2n));
  assert.equal(h.cursor.hash, hash(204));
  h.blocks.set(2n, { ...h.blocks.get(2n), hash: hash(302) });
  h.blocks.set(3n, { ...h.blocks.get(3n), hash: hash(303), parentHash: hash(302) });
  h.blocks.set(4n, { ...h.blocks.get(4n), hash: hash(304), parentHash: hash(303) });
  await assert.rejects(indexVirtualRange(h.rpc, h.store, engine, 4), /Finalized/);
});
test("missing/mismatched receipt blocks projection and checkpoint advancement", async () => {
  const h = harness();
  h.rpc.receipts = async () => [receipt()];
  await assert.rejects(indexVirtualRange(h.rpc, h.store, engine, 2), /Noncanonical/);
  assert.equal(h.cursor.number, 0n);
});
test("versioned points candidates defer open episodes, net losses, flag churn and ignore provisional/duplicates", () => {
  const f = {
    version: "test-only-v1",
    month: "2026-10",
    volumeWeight: "1",
    pnlWeight: "1",
    dayWeight: "1",
    volumeCap: "1000000000",
    pnlCap: "100000000",
    dayCap: 31,
    minHoldingSeconds: 60,
  };
  const timestamp = Date.parse("2026-10-15T00:00:00Z") / 1000;
  const b = { ...buy, timestamp, finalized: true };
  const open = pointsCandidate([b], f);
  assert(open.flags.includes("open-episode-deferred"));
  assert.equal(open.volume, "0");
  const sale = {
    ...ev(
      "TradeExecuted",
      {
        isBuy: false,
        input: "19090909",
        output: "9999999",
        outcome: 0,
        remainingShares: "0",
        remainingBasis: "0",
        realizedPnlDelta: "-1",
      },
      "1",
      2,
    ),
    timestamp: timestamp + 3600,
    finalized: true,
  };
  const a = pointsCandidate([b, sale, sale], f);
  assert.equal(a.realizedPnl, "-1");
  assert.equal(a.volume, "10000000");
  assert.equal(a.reviewOnly, true);
  assert.deepEqual(a, pointsCandidate([b, sale], f));
  assert.equal(
    pointsCandidate(
      [
        { ...b, finalized: false },
        { ...sale, finalized: false },
      ],
      f,
    ).volume,
    "0",
  );
  const churn = pointsCandidate([b, { ...sale, timestamp: timestamp + 1 }], f);
  assert(churn.flags.includes("rapid-offset"));
  assert.equal(churn.realizedPnl, "-1");
  assert.equal(churn.volume, "0");
  assert.throws(() => pointsCandidate([b], { ...f, volumeCap: "0" }));
});
