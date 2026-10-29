import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_CHAINLINK_FEEDS,
  BASE_SEQUENCER_FEED,
  BTC_USD_OFFICIAL,
  PAPER_TRADING_ASSETS,
  effectiveOracleMaxAgeSeconds,
} from "../../../src/lib/virtual/chainlink-feeds.ts";
import {
  assertExecutableChainlinkOracle,
  assertSequencerUp,
  createOracleClient,
  readFreshChainlinkSpot,
} from "../../../src/lib/virtual/chainlink-price.server.ts";

test("Base feed registry is BTC ETH SOL BNB only (no XRP)", () => {
  assert.deepEqual([...PAPER_TRADING_ASSETS], ["BTC", "ETH", "SOL", "BNB"]);
  assert.equal(Object.keys(BASE_CHAINLINK_FEEDS).sort().join(","), "BNB,BTC,ETH,SOL");
  for (const feed of Object.values(BASE_CHAINLINK_FEEDS)) {
    assert.match(feed.address, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(feed.decimals, 8);
    assert.ok(feed.recommendedMaxAgeSeconds >= 1);
    assert.ok(feed.recommendedMaxAgeSeconds <= 3600);
    assert.ok(feed.recommendedMaxAgeSeconds <= feed.heartbeatSeconds);
  }
  assert.match(BASE_SEQUENCER_FEED, /^0x[0-9a-fA-F]{40}$/);
  assert.match(BTC_USD_OFFICIAL, /^0x[0-9a-fA-F]{40}$/);
});

test("effective maxAge never exceeds feed recommendation or the 1h contract cap", () => {
  assert.equal(effectiveOracleMaxAgeSeconds("ETH", 3600), 1200);
  assert.equal(effectiveOracleMaxAgeSeconds("BNB", 86400), 3600);
  assert.equal(effectiveOracleMaxAgeSeconds("BTC", 60), 60);
  assert.throws(() => effectiveOracleMaxAgeSeconds("ETH", 0));
});

test("stale synthetic answers fail closed", async () => {
  const now = 1_800_000_000n;
  const client = {
    async readContract({ functionName }) {
      if (functionName === "decimals") return 8;
      if (functionName === "latestRoundData") {
        return [1n, 100n, now - 10_000n, now - 10_000n, 1n];
      }
      throw Error(functionName);
    },
  };
  await assert.rejects(
    () => readFreshChainlinkSpot(client, "ETH", 1200, now),
    /stale or invalid/,
  );
});

const rpc = process.env.VIRTUAL_RPC_URL || process.env.BASE_PROTOCOL_RPC_URL;

test(
  "live Ankr/Base Chainlink reads are fresh for BTC ETH SOL BNB",
  { skip: !rpc ? "VIRTUAL_RPC_URL / BASE_PROTOCOL_RPC_URL not set" : false },
  async () => {
    const client = createOracleClient(rpc);
    await assertSequencerUp(client);
    for (const asset of PAPER_TRADING_ASSETS) {
      const maxAge = effectiveOracleMaxAgeSeconds(asset, 3600);
      const spot = await assertExecutableChainlinkOracle(client, asset, maxAge);
      assert.equal(spot.asset, asset);
      assert.ok(spot.answer > 0n);
      assert.ok(spot.ageSeconds <= maxAge);
    }
  },
);
