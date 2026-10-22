import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRanking, atoms, signedMoney, isWallet } from "../../src/lib/ranking/core.mjs";
const A = "0x" + "a".repeat(40),
  B = "0x" + "b".repeat(40),
  C = "0x" + "c".repeat(40),
  ZERO = "0x" + "0".repeat(40),
  NOW = Date.parse("2026-10-22T12:00:00Z");
function fixture() {
  let i = 0;
  const e = (name, p, tx) => ({
    event_name: name,
    payload: p,
    tx_hash: "0x" + String(tx).padStart(64, "0"),
    log_index: i++,
  });
  const events = [
    e("MarketCreated", { marketId: "1", tokenIds: ["10", "11"] }, 1),
    e(
      "TransferBatch",
      { from: ZERO, to: A, ids: ["10", "11"], values: ["1000000000", "1000000000"] },
      2,
    ),
    e("PositionCreated", { marketId: "1", account: A, collateral: "1000000000" }, 2),
    e("TransferSingle", { from: A, to: B, id: "10", value: "500000000" }, 3),
    e(
      "TradeExecuted",
      {
        marketId: "1",
        buyer: B,
        seller: A,
        outcome: 0,
        shares: "500000000",
        usdcAmount: "300000000",
      },
      3,
    ),
    e("ResolutionFinalized", { marketId: "1", weights: ["1", "0"] }, 4),
  ];
  return {
    events,
    markets: [{ id: "m1", onchain_id: "1", market_id: "TACP-8453-1", title: "Test market" }],
    tradeTimes: { [events[4].tx_hash + ":" + events[4].log_index]: "2026-10-22T10:00:00Z" },
    settledTimes: { m1: "2026-10-22T11:00:00Z" },
    now: NOW,
  };
}
test("complete-set cost basis yields 200/-200 USDC P&L; independent payout cross-check", () => {
  const r = buildRanking(fixture());
  assert.deepEqual(
    r.map((t) => [t.wallet, t.pnlAtomic, t.rank, t.volumeAtomic]),
    [
      [B, "200000000", 1, "300000000"],
      [A, "-200000000", 2, "300000000"],
    ],
  );
  assert.equal(
    r.reduce((s, t) => s + BigInt(t.pnlAtomic), 0n),
    0n,
  );
});
test("redemption cannot double-count settlement", () => {
  const f = fixture(),
    tx = "0x" + "5".padStart(64, "0");
  f.events.push(
    {
      event_name: "TransferBatch",
      payload: { from: B, to: ZERO, ids: ["10", "11"], values: ["500000000", "0"] },
      tx_hash: tx,
      log_index: 6,
    },
    {
      event_name: "PositionRedeemed",
      payload: { marketId: "1", account: B, collateral: "500000000" },
      tx_hash: tx,
      log_index: 7,
    },
  );
  const b = buildRanking(f).find((t) => t.wallet === B);
  assert.equal(b.pnlAtomic, "200000000");
  assert.equal(b.positions.length, 0);
});
test("open-market gain does not become settled profit", () => {
  const f = fixture();
  f.events.pop();
  f.settledTimes = {};
  const r = buildRanking(f);
  assert.ok(r.every((t) => t.pnlAtomic === null && t.rank === null));
});
test("unexplained gift invalidates both cost bases", () => {
  const f = fixture();
  f.events.push({
    event_name: "TransferSingle",
    payload: { from: B, to: C, id: "10", value: "1000000" },
    tx_hash: "0x" + "6".padStart(64, "0"),
    log_index: 8,
  });
  const r = buildRanking(f);
  assert.equal(r.find((t) => t.wallet === B).pnlAtomic, null);
  assert.equal(r.find((t) => t.wallet === C).rank, null);
});
test("volume and settlement windows use their own real timestamps", () => {
  const f = fixture();
  f.tradeTimes[Object.keys(f.tradeTimes)[0]] = "2026-09-01T10:00:00Z";
  const r = buildRanking({ ...f, period: "1d" });
  assert.equal(r[0].volumeAtomic, "0");
  assert.equal(r[0].pnlAtomic, "200000000");
});
test("old settlement is not current-period P&L", () => {
  const f = fixture();
  f.settledTimes.m1 = "2026-09-01T11:00:00Z";
  assert.ok(buildRanking({ ...f, period: "1d" }).every((t) => t.pnlAtomic === null));
});
test("void payouts preserve aggregate precision", () => {
  const f = fixture();
  f.events[5].payload.weights = ["1", "1"];
  const r = buildRanking(f);
  assert.equal(r.find((t) => t.wallet === B).pnlAtomic, "-50000000");
  assert.equal(r.find((t) => t.wallet === A).pnlAtomic, "50000000");
});
test("duplicates, missing transfers and missing timestamps fail closed", () => {
  const f = fixture();
  assert.throws(() => buildRanking({ ...f, events: [...f.events, f.events[0]] }), /Duplicate/);
  assert.throws(
    () => buildRanking({ ...f, events: f.events.filter((e) => e.event_name !== "TransferBatch") }),
    /Incomplete/,
  );
  assert.throws(() => buildRanking({ ...f, tradeTimes: {} }), /Missing finalized trade time/);
});
test("exact atomic math, signed formatting and zero-wallet rejection", () => {
  assert.equal(atoms("9007199254740993123"), 9007199254740993123n);
  assert.throws(() => atoms(9007199254740992), /Unsafe/);
  assert.equal(signedMoney("-1234567"), "−$1.23");
  assert.equal(signedMoney(null), "—");
  assert.equal(signedMoney("0"), "$0.00");
  assert.equal(isWallet(ZERO), false);
});
test("public data never links auth identities; admin requires role/AAL2; search removed", () => {
  const read = fs.readFileSync(
      new URL("../../src/lib/ranking/read.server.ts", import.meta.url),
      "utf8",
    ),
    fn = fs.readFileSync(
      new URL("../../src/lib/ranking/read.functions.ts", import.meta.url),
      "utf8",
    ),
    nav = fs.readFileSync(new URL("../../src/components/app-shell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(
    read,
    /auth\.admin|user_roles|protocol_wallets|profiles|usdc_balance|\.insert\(|\.update\(/,
  );
  assert.match(read, /\.eq\("chain_id", 8453\)/);
  assert.match(read, /\.lte\("block_number", checkpoint.block_number\)/);
  assert.match(fn, /requireAdmin/);
  assert.match(fn, /context.claims.aal/);
  assert.doesNotMatch(nav, /to: "\/search"/);
  assert.match(nav, /label: "Ranking"/);
});
