import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileProjectionSnapshot as reconcile } from "../scripts/reconcile-projection-snapshot.mjs";
const addr = (n) => "0x" + n.repeat(40),
  hash = (n) => "0x" + n.repeat(64),
  A = addr("a"),
  B = addr("b"),
  zero = addr("0");
function snapshot() {
  const market = {
    uuid: "isolated-market",
    chainId: 84532,
    onchainId: "1",
    questionId: hash("1"),
    conditionId: hash("2"),
    metadataHash: hash("3"),
    rulesHash: hash("4"),
    sourceHash: hash("5"),
    outcomeCount: 2,
    openInterestAtomic: "1000000",
    volumeAtomic: "500000",
  };
  const ev = (tx, log, eventName, payload, block = "10") => ({
    chainId: 84532,
    txHash: hash(tx),
    logIndex: log,
    blockNumber: block,
    blockHash: hash("c"),
    contractAddress: addr("1"),
    eventName,
    payload,
  });
  const canonicalEvents = [
    ev("1", 0, "MarketCreated", {
      marketId: "1",
      ...Object.fromEntries(
        ["questionId", "conditionId", "metadataHash", "rulesHash", "sourceHash"].map((k) => [
          k,
          market[k],
        ]),
      ),
      outcomeCount: 2,
      tokenIds: ["101", "102"],
    }),
    ev("2", 0, "PositionCreated", { marketId: "1", collateral: "1000000" }),
    ev("2", 1, "TransferBatch", {
      from: zero,
      to: A,
      ids: ["101", "102"],
      values: ["1000000", "1000000"],
    }),
    ev("3", 0, "TransferSingle", { from: A, to: B, id: "101", value: "1000000" }, "11"),
    ev(
      "3",
      1,
      "TradeExecuted",
      {
        marketId: "1",
        buyer: B,
        seller: A,
        outcome: 0,
        price: "500000",
        shares: "1000000",
        usdcAmount: "500000",
        buyOrderId: hash("a"),
        sellOrderId: hash("b"),
      },
      "11",
    ),
  ];
  return {
    schemaVersion: "tacpredict-projection-reconciliation-v1",
    exchangeVersion: 1,
    chainId: 84532,
    deploymentBlock: "10",
    checkpoint: { blockNumber: "11", blockHash: hash("c") },
    coverage: {
      fromBlock: "10",
      throughBlock: "11",
      includesAllCanonicalProtocolLogs: true,
      includesAllProjectionRows: true,
    },
    canonicalEvents,
    chainEvents: structuredClone(canonicalEvents),
    markets: [market],
    outcomes: [
      { marketUuid: market.uuid, outcomeIndex: 0, tokenId: "101" },
      { marketUuid: market.uuid, outcomeIndex: 1, tokenId: "102" },
    ],
    trades: [
      {
        chainId: 84532,
        txHash: hash("3"),
        logIndex: 1,
        marketUuid: market.uuid,
        buyer: B,
        seller: A,
        outcomeIndex: 0,
        priceAtomic: "500000",
        sharesAtomic: "1000000",
        usdcAtomic: "500000",
        buyOrderId: hash("a"),
        sellOrderId: hash("b"),
      },
    ],
    claims: [],
    refunds: [],
    positions: [
      { marketUuid: market.uuid, walletAddress: A, outcomeIndex: 1, sharesAtomic: "1000000" },
      { marketUuid: market.uuid, walletAddress: B, outcomeIndex: 0, sharesAtomic: "1000000" },
    ],
  };
}
const has = (r, code) => assert.ok(r.counts[code] > 0, code);
test("complete synthetic snapshot reconciles without authorizing launch or claiming independent chain proof", () => {
  const r = reconcile(snapshot());
  assert.equal(r.issueCount, 0);
  assert.equal(r.launchAuthorized, false);
  assert.equal(r.canonicalCoverageIndependentlyVerified, false);
  assert.equal(r.repairInstructionsGenerated, false);
});
test("missing raw event and missing trade projection are separately identified", () => {
  const s = snapshot();
  s.chainEvents.pop();
  s.trades = [];
  const r = reconcile(s);
  has(r, "MISSING_RAW_EVENT");
  has(r, "MISSING_TRADE_PROJECTION");
});
test("incorrect execution values and independent notional totals are detected", () => {
  const s = snapshot();
  s.trades[0].usdcAtomic = "500001";
  s.markets[0].volumeAtomic = "500001";
  const r = reconcile(s);
  has(r, "TRADE_PROJECTION_MISMATCH");
  has(r, "VOLUME_PROJECTION_MISMATCH");
});
test("missing parent and token mappings cannot be relabeled as clean", () => {
  const s = snapshot();
  s.markets = [];
  const r = reconcile(s);
  has(r, "MISSING_MARKET_PROJECTION");
  has(r, "ORPHAN_OUTCOME");
});
test("identity mismatch, ambiguous tokens and wrong-chain projection detected", () => {
  const s = snapshot();
  s.markets[0].conditionId = hash("9");
  s.markets[0].chainId = 8453;
  s.outcomes.push({ ...s.outcomes[0], marketUuid: "other" });
  const r = reconcile(s);
  has(r, "MARKET_IDENTITY_MISMATCH");
  has(r, "WRONG_CHAIN_MARKET");
  has(r, "AMBIGUOUS_OUTCOME_TOKEN");
});
test("transfer-derived inventory and collateral conservation checked with BigInt", () => {
  const s = snapshot();
  s.positions[0].sharesAtomic = "999999";
  s.markets[0].openInterestAtomic = "999999";
  const r = reconcile(s);
  has(r, "POSITION_BALANCE_MISMATCH");
  has(r, "COLLATERAL_PROJECTION_MISMATCH");
});
test("missing nonzero position and extra orphan trade flagged", () => {
  const s = snapshot();
  s.positions.pop();
  s.trades.push({ ...s.trades[0], txHash: hash("7") });
  const r = reconcile(s);
  has(r, "MISSING_POSITION_PROJECTION");
  has(r, "ORPHAN_TRADEEXECUTED_PROJECTION");
});
test("duplicate canonical/raw rows and canonical payload mismatches fail reconciliation", () => {
  const s = snapshot();
  s.canonicalEvents.push({ ...s.canonicalEvents[0] });
  s.chainEvents.push({ ...s.chainEvents[0] });
  s.chainEvents[1].payload.collateral = "1";
  const r = reconcile(s);
  has(r, "DUPLICATE_CANONICAL_EVENT");
  has(r, "DUPLICATE_RAW_EVENT");
  has(r, "CANONICAL_EVENT_MISMATCH");
});
test("financial JS numbers/floats, uint256 overflow and incomplete coverage rejected", () => {
  let s = snapshot();
  s.trades[0].usdcAtomic = 500000;
  assert.throws(() => reconcile(s), /atomic string/);
  s = snapshot();
  s.positions[0].sharesAtomic = (1n << 256n).toString();
  assert.throws(() => reconcile(s), /atomic string/);
  s = snapshot();
  s.coverage.fromBlock = "11";
  assert.throws(() => reconcile(s), /coverage/);
});
test("FeeV2/Pool snapshots refused rather than using V1 accounting semantics", () => {
  const s = snapshot();
  s.exchangeVersion = 2;
  assert.throws(() => reconcile(s), /version/);
});
test("principal claim and VOID refund projections stay separate from one another", () => {
  const s = snapshot(),
    e = {
      chainId: 84532,
      txHash: hash("8"),
      logIndex: 0,
      blockNumber: "11",
      blockHash: hash("c"),
      contractAddress: addr("1"),
      eventName: "PositionRedeemed",
      payload: { marketId: "1", account: B, collateral: "1000000", voided: true },
    };
  s.canonicalEvents.push(e);
  s.chainEvents.push(structuredClone(e));
  s.markets[0].openInterestAtomic = "0";
  s.claims.push({
    chainId: 84532,
    txHash: e.txHash,
    logIndex: 0,
    marketUuid: "isolated-market",
    walletAddress: B,
    amountAtomic: "1000000",
  });
  const r = reconcile(s);
  has(r, "MISSING_REFUND_PROJECTION");
  has(r, "ORPHAN_CLAIM_PROJECTION");
});
test("report redacts buyer/seller/wallet addresses and provides no repair payloads", () => {
  const s = snapshot();
  s.positions[0].sharesAtomic = "1";
  s.checkpoint.ignoredPrivateInput = "do-not-echo";
  const r = reconcile(s),
    text = JSON.stringify(r);
  assert.equal(text.includes(A), false);
  assert.equal(text.includes(B), false);
  assert.equal(text.includes("do-not-echo"), false);
  assert.equal(text.includes("INSERT "), false);
  assert.equal(text.includes("UPDATE "), false);
});

test("CLI writes a new redacted report but refuses to overwrite a snapshot/report", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const dir = await mkdtemp(join(tmpdir(), "tacpredict-reconciliation-test-"));
  try {
    const input = join(dir, "input.json"),
      output = join(dir, "report.json"),
      text = JSON.stringify(snapshot());
    await writeFile(input, text);
    const script = fileURLToPath(
      new URL("../scripts/reconcile-projection-snapshot.mjs", import.meta.url),
    );
    let r = spawnSync(process.execPath, [script, "--snapshot", input, "--report", output], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(await readFile(output, "utf8")).launchAuthorized, false);
    r = spawnSync(process.execPath, [script, "--snapshot", input, "--report", input], {
      encoding: "utf8",
    });
    assert.equal(r.status, 1);
    assert.equal(await readFile(input, "utf8"), text);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
