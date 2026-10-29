/**
 * Regenerate timed Base Sepolia private QA artifacts (createPool → Buy/Sell).
 * Unsigned only — never reads or embeds private keys.
 *
 * Usage:
 *   node scripts/prepare-qa-flow-sepolia.mjs
 *   OPEN_IN_SEC=900 node scripts/prepare-qa-flow-sepolia.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbiParameters,
  stringToHex,
  toHex,
} from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../launch/approved-sepolia");

const ENGINE = "0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46";
const FUNDED = "0x6397A026560e7b66584F087739b15AE2bda8610f";
const FEED = "0x657F55EdDeb1ab37F1bebF99824147B60fC47Aca";
const SEQ = "0x5408ef3943d478E0d2F039C6C95a561A9C24eD02";
const CHAIN_ID = 84532n;
const U = 1_000_000n; // 6-decimal virtual atoms
const BTC_PRICE_8 = 10_000_000_000_000n; // $100,000 with 8 decimals

const now = BigInt(Math.floor(Date.now() / 1000));
const openIn = BigInt(process.env.OPEN_IN_SEC || "600"); // 10 min default
const openAt = now + openIn;
// Must stay >= block.timestamp at configureMonthlyCampaign send time.
// Anchor near openAt so steps 1–3 cannot make startsAt stale.
const campStarts = openAt - 90n;
const closeAt = openAt + 3600n;
const resolveAfter = closeAt;
const resolutionDeadline = closeAt + 900n;
const campEnds = now + 30n * 24n * 3600n;
const tPred = openAt - 60n; // feed round 1 must be strictly before openAt
const boundaryTolerance = 300; // max allowed — capture window after open
const grantAmount = 100n * U;
const campaignId = 1n;
const marketId = 1n;

const leaf = keccak256(
  keccak256(
    encodeAbiParameters(parseAbiParameters("address,uint256,uint256,address,uint128"), [
      ENGINE,
      CHAIN_ID,
      campaignId,
      FUNDED,
      grantAmount,
    ]),
  ),
);

const terms = {
  rulesHash: keccak256(stringToHex("sepolia-qa-btc-updown-v1")),
  openAt,
  closeAt,
  resolveAfter,
  resolutionDeadline,
  challengePeriod: 60,
  seed: 1000n * U,
  reserveFloor: 10n * U,
  maxCashIn: 100n * U,
  maxSharesIn: 500n * U,
  maxPosition: 1000n * U,
  feeBps: 0,
  outcomes: 2,
};

const policy = {
  feed: FEED,
  sequencer: SEQ,
  asset: toHex("BTC", { size: 32 }),
  maxAge: 3600,
  boundaryTolerance,
  sigmaPpm: 1000,
  spreadPpm: 10_000,
  impactPpm: 10_000,
  skewPpm: 1000,
  minProbabilityPpm: 10_000,
  minSpot: 1n,
  maxSpot: 10_000_000n * 100_000_000n,
  tieVoids: true,
};

const month = keccak256(stringToHex("2026-10-qa"));
const eligibilityHash = keccak256(stringToHex("sepolia-qa-eligibility"));

const createPoolData = encodeFunctionData({
  abi: [
    {
      type: "function",
      name: "createPool",
      inputs: [
        {
          name: "t",
          type: "tuple",
          components: [
            { name: "rulesHash", type: "bytes32" },
            { name: "openAt", type: "uint64" },
            { name: "closeAt", type: "uint64" },
            { name: "resolveAfter", type: "uint64" },
            { name: "resolutionDeadline", type: "uint64" },
            { name: "challengePeriod", type: "uint32" },
            { name: "seed", type: "uint64" },
            { name: "reserveFloor", type: "uint64" },
            { name: "maxCashIn", type: "uint64" },
            { name: "maxSharesIn", type: "uint64" },
            { name: "maxPosition", type: "uint64" },
            { name: "feeBps", type: "uint16" },
            { name: "outcomes", type: "uint8" },
          ],
        },
      ],
      outputs: [{ type: "uint256" }],
    },
  ],
  functionName: "createPool",
  args: [terms],
});

const configurePolicyData = encodeFunctionData({
  abi: [
    {
      type: "function",
      name: "configurePricePolicy",
      inputs: [
        { name: "id", type: "uint256" },
        {
          name: "c",
          type: "tuple",
          components: [
            { name: "feed", type: "address" },
            { name: "sequencer", type: "address" },
            { name: "asset", type: "bytes32" },
            { name: "maxAge", type: "uint32" },
            { name: "boundaryTolerance", type: "uint32" },
            { name: "sigmaPpm", type: "uint32" },
            { name: "spreadPpm", type: "uint32" },
            { name: "impactPpm", type: "uint32" },
            { name: "skewPpm", type: "uint32" },
            { name: "minProbabilityPpm", type: "uint32" },
            { name: "minSpot", type: "uint128" },
            { name: "maxSpot", type: "uint128" },
            { name: "tieVoids", type: "bool" },
          ],
        },
      ],
      outputs: [],
    },
  ],
  functionName: "configurePricePolicy",
  args: [marketId, policy],
});

const configureCampaignData = encodeFunctionData({
  abi: [
    {
      type: "function",
      name: "configureMonthlyCampaign",
      inputs: [
        { name: "month", type: "bytes32" },
        { name: "root", type: "bytes32" },
        { name: "budget", type: "uint128" },
        { name: "startsAt", type: "uint64" },
        { name: "endsAt", type: "uint64" },
        { name: "maxPerWallet", type: "uint128" },
        { name: "eligibilityHash", type: "bytes32" },
      ],
      outputs: [{ type: "uint256" }],
    },
  ],
  functionName: "configureMonthlyCampaign",
  args: [month, leaf, grantAmount, campStarts, campEnds, grantAmount, eligibilityHash],
});

const payload = {
  generatedAtUtc: new Date().toISOString(),
  chainId: 84532,
  engine: ENGINE,
  funded: FUNDED,
  feed: FEED,
  seq: SEQ,
  schedule: {
    now: Number(now),
    openAt: Number(openAt),
    closeAt: Number(closeAt),
    campStarts: Number(campStarts),
    campEnds: Number(campEnds),
    tPred: Number(tPred),
    openAtIso: new Date(Number(openAt) * 1000).toISOString(),
    campStartsIso: new Date(Number(campStarts) * 1000).toISOString(),
    captureDeadlineUnix: Number(openAt) + boundaryTolerance,
  },
  marketIdExpected: 1,
  grantAmountAtoms: grantAmount.toString(),
  merkleLeaf: leaf,
  createPoolData,
  configurePolicyData,
  configureCampaignData,
  btcPrice8: BTC_PRICE_8.toString(),
  boundaryTolerance,
  notes: [
    "Sign only on your machine. Never paste MY_LOCAL_KEY into Cursor.",
    "captureStart must land in [openAt, openAt+boundaryTolerance].",
    "Buy and Sell are separate transactions (oneTrade).",
    "XRP still disabled. No Mainnet.",
  ],
};

fs.writeFileSync(path.join(outDir, "qa-flow-0x6397.json"), JSON.stringify(payload, null, 2));

const sh = `#!/usr/bin/env bash
# Base Sepolia private QA — run on YOUR machine only. Do not paste keys into Cursor.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
JSON="$(cd "$(dirname "$0")" && pwd)/qa-flow-0x6397.json"
ENGINE=$(jq -r .engine "$JSON")
FEED=$(jq -r .feed "$JSON")
SEQ=$(jq -r .seq "$JSON")
ADMIN=$(jq -r .funded "$JSON")
RPC=\${VIRTUAL_TESTNET_RPC_URL:-https://sepolia.base.org}
PRICE=$(jq -r .btcPrice8 "$JSON")
OPEN=$(jq -r .schedule.openAt "$JSON")
CAMP=$(jq -r .schedule.campStarts "$JSON")
TPRED=$(jq -r .schedule.tPred "$JSON")
CAP_DEAD=$(jq -r .schedule.captureDeadlineUnix "$JSON")

if [[ -z "\${MY_LOCAL_KEY:-}" ]]; then
  echo "Set MY_LOCAL_KEY locally (funded 0x6397…), then re-run. Never paste the key into chat."
  exit 1
fi

wait_until() {
  local target=\$1 label=\$2
  while true; do
    local now
    now=\$(date -u +%s)
    if (( now >= target )); then break; fi
    echo "… waiting for \$label (\$((target - now))s)"
    sleep 5
  done
}

echo "=== 0) preflight ==="
cast chain-id --rpc-url "\$RPC" | grep -qx 84532
POOLS=\$(cast call "\$ENGINE" "poolCount()(uint256)" --rpc-url "\$RPC")
echo "poolCount=\$POOLS (expect 0 for first marketId=1)"
echo "openAt=\$OPEN captureDeadline=\$CAP_DEAD"

echo "=== 1) sequencer UP + feed predecessor (round 1) ==="
cast send "\$SEQ" "push(int256,uint256)" 0 \$((\$(date -u +%s)-4001)) --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY"
cast send "\$FEED" "push(int256,uint256)" "\$PRICE" "\$TPRED" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY"

echo "=== 2) createPool ==="
TX_POOL=\$(cast send "\$ENGINE" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --data "\$(jq -r .createPoolData "\$JSON")" --json | jq -r .transactionHash)
echo "createPool \$TX_POOL"

echo "=== 3) configurePricePolicy ==="
TX_POL=\$(cast send "\$ENGINE" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --data "\$(jq -r .configurePolicyData "\$JSON")" --json | jq -r .transactionHash)
echo "configurePricePolicy \$TX_POL"

echo "=== 4) configureMonthlyCampaign ==="
TX_CAMP=\$(cast send "\$ENGINE" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --data "\$(jq -r .configureCampaignData "\$JSON")" --json | jq -r .transactionHash)
echo "configureMonthlyCampaign \$TX_CAMP"

echo "=== 5) claimGrant after campStarts ==="
wait_until "\$CAMP" campStarts
TX_CLAIM=\$(cast send "\$ENGINE" "claimGrant(uint256,uint128,bytes32[])" 1 100000000 "[]" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --json | jq -r .transactionHash)
echo "claimGrant \$TX_CLAIM"
cast call "\$ENGINE" "cash(address)(uint128)" "\$ADMIN" --rpc-url "\$RPC"

echo "=== 6) openAt → feed round 2 + captureStart ==="
wait_until "\$OPEN" openAt
NOW=\$(date -u +%s)
if (( NOW > CAP_DEAD )); then
  echo "FATAL: past captureDeadline (\$CAP_DEAD). Regenerate with OPEN_IN_SEC=900 and re-run."
  exit 1
fi
cast send "\$FEED" "push(int256,uint256)" "\$PRICE" "\$NOW" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY"
TX_CAP=\$(cast send "\$ENGINE" "captureStart(uint256,uint80)" 1 2 --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --json | jq -r .transactionHash)
echo "captureStart \$TX_CAP"
cast call "\$ENGINE" "startPrice(uint256)(uint128)" 1 --rpc-url "\$RPC"

echo "=== 7) Buy \$5 Up (outcome 0) — separate tx ==="
# Keep feed fresh for probability()
cast send "\$FEED" "push(int256,uint256)" "\$PRICE" "\$(date -u +%s)" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY"
NONCE=\$(cast call "\$ENGINE" "actionNonce(address)(uint256)" "\$ADMIN" --rpc-url "\$RPC" | awk '{print \$1}')
REV=\$(cast call "\$ENGINE" "pool(uint256)((bytes32,uint64,uint64,uint64,uint64,uint32,uint64,uint64,uint64,uint64,uint64,uint16,uint8),uint64[3],uint128,uint64,bool,bool,bool,uint8)" 1 --rpc-url "\$RPC" 2>/dev/null || true)
# revision starts at 1; after captureStart pool.revision is still 1 until first trade
DEADLINE=\$(( \$(date -u +%s) + 900 ))
TX_BUY=\$(cast send "\$ENGINE" "buy(uint256,uint8,uint64,uint64,uint64,uint64,uint256)" \\
  1 0 5000000 1 1 "\$DEADLINE" "\$NONCE" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --json | jq -r .transactionHash)
echo "buy \$TX_BUY"

echo "=== 8) Sell all Up shares — separate tx ==="
cast send "\$FEED" "push(int256,uint256)" "\$PRICE" "\$(date -u +%s)" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY"
POS=\$(cast call "\$ENGINE" "positions(uint256,address,uint8)(uint64,uint128,int256)" 1 "\$ADMIN" 0 --rpc-url "\$RPC")
SHARES=\$(echo "\$POS" | head -1 | awk '{print \$1}')
NONCE2=\$(cast call "\$ENGINE" "actionNonce(address)(uint256)" "\$ADMIN" --rpc-url "\$RPC" | awk '{print \$1}')
# revision bumped to 2 after buy
DEADLINE2=\$(( \$(date -u +%s) + 900 ))
TX_SELL=\$(cast send "\$ENGINE" "sell(uint256,uint8,uint64,uint64,uint64,uint64,uint256)" \\
  1 0 "\$SHARES" 1 2 "\$DEADLINE2" "\$NONCE2" --rpc-url "\$RPC" --private-key "\$MY_LOCAL_KEY" --json | jq -r .transactionHash)
echo "sell \$TX_SELL"

echo
echo "=== HASHES (paste back into Cursor) ==="
cat <<EOF
createPool: \$TX_POOL
configurePricePolicy: \$TX_POL
configureMonthlyCampaign: \$TX_CAMP
claimGrant: \$TX_CLAIM
captureStart: \$TX_CAP
buy: \$TX_BUY
sell: \$TX_SELL
EOF
unset MY_LOCAL_KEY
`;

const shPath = path.join(outDir, "qa-flow-0x6397.sh");
fs.writeFileSync(shPath, sh, { mode: 0o755 });
fs.chmodSync(shPath, 0o755);

console.log(
  JSON.stringify(
    {
      wrote: ["qa-flow-0x6397.json", "qa-flow-0x6397.sh"],
      openAtIso: payload.schedule.openAtIso,
      campStartsIso: payload.schedule.campStartsIso,
      captureDeadlineUnix: payload.schedule.captureDeadlineUnix,
      merkleLeaf: leaf,
    },
    null,
    2,
  ),
);
