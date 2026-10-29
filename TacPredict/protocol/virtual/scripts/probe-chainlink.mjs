/**
 * Read-only Chainlink probe on Base via VIRTUAL_RPC_URL / BASE_PROTOCOL_RPC_URL (Ankr).
 * No transactions. Fail closed summary for paper-trading readiness.
 */
import {
  PAPER_TRADING_ASSETS,
  effectiveOracleMaxAgeSeconds,
} from "../../../src/lib/virtual/chainlink-feeds.ts";
import {
  assertExecutableChainlinkOracle,
  createOracleClient,
  oracleRpcUrl,
} from "../../../src/lib/virtual/chainlink-price.server.ts";

const client = createOracleClient(oracleRpcUrl());
const out = { chainId: await client.getChainId(), assets: PAPER_TRADING_ASSETS, feeds: {} };
for (const asset of PAPER_TRADING_ASSETS) {
  const maxAge = effectiveOracleMaxAgeSeconds(asset, 3600);
  try {
    const spot = await assertExecutableChainlinkOracle(client, asset, maxAge);
    out.feeds[asset] = {
      ok: true,
      feed: spot.feed,
      answer: spot.answer.toString(),
      decimals: spot.decimals,
      ageSeconds: spot.ageSeconds,
      maxAgeSeconds: spot.maxAgeSeconds,
    };
  } catch (e) {
    out.feeds[asset] = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
console.log(JSON.stringify(out, null, 2));
if (Object.values(out.feeds).some((f) => !f.ok)) process.exitCode = 1;
