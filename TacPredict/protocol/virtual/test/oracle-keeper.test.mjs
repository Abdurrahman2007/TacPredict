import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assetSettlementPolicy,
  chainlinkSupportsWindow,
  isXrpAsset,
  XRP_FOLLOWUP,
} from "../../../src/lib/virtual/oracle-policy.ts";
import {
  assertKeeperNetworkAllowed,
  memoryKeeperStore,
  runKeeperTick,
} from "../../../src/lib/virtual/keeper.ts";

test("XRP stays in product but trading/settlement blocked", () => {
  assert.equal(isXrpAsset("xrp"), true);
  const p = assetSettlementPolicy("xrp", 5);
  assert.equal(p.tier, "unavailable");
  assert.equal(p.paperTradingAllowed, false);
  assert.equal(p.onchainSettlementAllowed, false);
  assert.ok(XRP_FOLLOWUP.steps.length >= 3);
});

test("5m BTC is paper_only — Chainlink heartbeat too slow", () => {
  const p = assetSettlementPolicy("bitcoin", 5);
  assert.equal(p.tier, "paper_only");
  assert.equal(p.paperTradingAllowed, true);
  assert.equal(p.onchainSettlementAllowed, false);
  assert.equal(chainlinkSupportsWindow("BTC", 5), false);
});

test("24h BTC may use Chainlink settlement tier", () => {
  const p = assetSettlementPolicy("bitcoin", 1440);
  assert.equal(p.tier, "chainlink_ok");
  assert.equal(p.onchainSettlementAllowed, true);
});

test("keeper rejects Mainnet submit", () => {
  assert.throws(() => assertKeeperNetworkAllowed(8453, true), /Mainnet/);
  assert.doesNotThrow(() => assertKeeperNetworkAllowed(84532, true));
  assert.doesNotThrow(() => assertKeeperNetworkAllowed(8453, false));
});

test("keeper tick is idempotent and retries failures", async () => {
  const store = memoryKeeperStore();
  let calls = 0;
  const plans = [
    { marketId: "1", action: "finalize", idempotencyKey: "1:finalize" },
  ];
  const r1 = await runKeeperTick({
    store,
    plans,
    maxAttempts: 3,
    execute: async () => {
      calls += 1;
      if (calls === 1) throw Error("rpc flake");
    },
  });
  assert.equal(r1.failed, 1);
  assert.equal(store.get("1:finalize")?.attempts, 1);

  const r2 = await runKeeperTick({
    store,
    plans,
    maxAttempts: 3,
    execute: async () => {
      calls += 1;
    },
  });
  assert.equal(r2.done, 1);
  assert.equal(store.get("1:finalize")?.status, "done");

  const r3 = await runKeeperTick({
    store,
    plans,
    maxAttempts: 3,
    execute: async () => {
      calls += 1;
    },
  });
  assert.equal(r3.skipped, 1);
  assert.equal(calls, 2);
});
