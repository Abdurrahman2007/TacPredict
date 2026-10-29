#!/usr/bin/env bash
# Base Sepolia private QA — run on YOUR machine only. Do not paste keys into Cursor.
set -euo pipefail
JSON="$(cd "$(dirname "$0")" && pwd)/qa-flow-0x6397.json"
ENGINE=$(jq -r .engine "$JSON")
FEED=$(jq -r .feed "$JSON")
SEQ=$(jq -r .seq "$JSON")
ADMIN=$(jq -r .funded "$JSON")
RPC=${VIRTUAL_TESTNET_RPC_URL:-https://sepolia.base.org}
PRICE=$(jq -r .btcPrice8 "$JSON")
OPEN=$(jq -r .schedule.openAt "$JSON")
CAMP=$(jq -r .schedule.campStarts "$JSON")
TPRED=$(jq -r .schedule.tPred "$JSON")
CAP_DEAD=$(jq -r .schedule.captureDeadlineUnix "$JSON")

if [[ -z "${MY_LOCAL_KEY:-}" ]]; then
  echo "Set MY_LOCAL_KEY locally (funded 0x6397…), then re-run. Never paste the key into chat."
  exit 1
fi

wait_until() {
  local target=$1 label=$2
  while true; do
    local now
    now=$(date -u +%s)
    if (( now >= target )); then break; fi
    echo "… waiting for $label ($((target - now))s)"
    sleep 5
  done
}

txhash() {
  # cast --json prints receipt; prefer transactionHash then hash
  jq -r '.transactionHash // .hash // empty'
}

echo "=== 0) preflight ==="
cast chain-id --rpc-url "$RPC" | grep -qx 84532
echo "poolCount=$(cast call "$ENGINE" "poolCount()(uint256)" --rpc-url "$RPC")"
echo "openAt=$(jq -r .schedule.openAtIso "$JSON") captureDeadline=$CAP_DEAD"
NOW0=$(date -u +%s)
if (( NOW0 > OPEN )); then
  echo "FATAL: openAt already passed. Regenerate: OPEN_IN_SEC=900 node scripts/prepare-qa-flow-sepolia.mjs"
  exit 1
fi

echo "=== 1) sequencer UP + feed predecessor (round 1) ==="
cast send "$SEQ" "push(int256,uint256)" 0 $(($(date -u +%s)-4001)) --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$TPRED" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null

echo "=== 2) createPool ==="
TX_POOL=$(cast send "$ENGINE" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --data "$(jq -r .createPoolData "$JSON")" --json | txhash)
echo "createPool $TX_POOL"

echo "=== 3) configurePricePolicy ==="
TX_POL=$(cast send "$ENGINE" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --data "$(jq -r .configurePolicyData "$JSON")" --json | txhash)
echo "configurePricePolicy $TX_POL"

echo "=== 4) configureMonthlyCampaign ==="
TX_CAMP=$(cast send "$ENGINE" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --data "$(jq -r .configureCampaignData "$JSON")" --json | txhash)
echo "configureMonthlyCampaign $TX_CAMP"

echo "=== 5) claimGrant after campStarts ==="
wait_until "$CAMP" campStarts
TX_CLAIM=$(cast send "$ENGINE" "claimGrant(uint256,uint128,bytes32[])" 1 100000000 "[]" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "claimGrant $TX_CLAIM"
echo "cash=$(cast call "$ENGINE" "cash(address)(uint128)" "$ADMIN" --rpc-url "$RPC")"

echo "=== 6) openAt → feed round 2 + captureStart ==="
wait_until "$OPEN" openAt
NOW=$(date -u +%s)
if (( NOW > CAP_DEAD )); then
  echo "FATAL: past captureDeadline ($CAP_DEAD). Regenerate with OPEN_IN_SEC=900 and re-run."
  exit 1
fi
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$NOW" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
TX_CAP=$(cast send "$ENGINE" "captureStart(uint256,uint80)" 1 2 --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "captureStart $TX_CAP"
echo "startPrice=$(cast call "$ENGINE" "startPrice(uint256)(uint128)" 1 --rpc-url "$RPC")"

echo "=== 7) Buy 5 vUSDC Up (outcome 0) — separate tx ==="
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$(date -u +%s)" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
NONCE=$(cast call "$ENGINE" "actionNonce(address)(uint256)" "$ADMIN" --rpc-url "$RPC" | awk '{print $1}')
# revision is 1 until first trade
DEADLINE=$(( $(date -u +%s) + 900 ))
TX_BUY=$(cast send "$ENGINE" "buy(uint256,uint8,uint64,uint64,uint64,uint64,uint256)" \
  1 0 5000000 1 1 "$DEADLINE" "$NONCE" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "buy $TX_BUY"

echo "=== 8) Sell all Up shares — separate tx ==="
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$(date -u +%s)" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
# cast prints three return values; shares is first
SHARES=$(cast call "$ENGINE" "positions(uint256,address,uint8)(uint64,uint128,int256)" 1 "$ADMIN" 0 --rpc-url "$RPC" | awk 'NR==1{print $1}')
if [[ -z "$SHARES" || "$SHARES" == "0" ]]; then
  echo "FATAL: no shares after buy"
  exit 1
fi
NONCE2=$(cast call "$ENGINE" "actionNonce(address)(uint256)" "$ADMIN" --rpc-url "$RPC" | awk '{print $1}')
DEADLINE2=$(( $(date -u +%s) + 900 ))
# revision bumped to 2 after buy
TX_SELL=$(cast send "$ENGINE" "sell(uint256,uint8,uint64,uint64,uint64,uint64,uint256)" \
  1 0 "$SHARES" 1 2 "$DEADLINE2" "$NONCE2" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "sell $TX_SELL"

echo
echo "=== HASHES (paste back into Cursor — hashes only) ==="
cat <<EOF
createPool: $TX_POOL
configurePricePolicy: $TX_POL
configureMonthlyCampaign: $TX_CAMP
claimGrant: $TX_CLAIM
captureStart: $TX_CAP
buy: $TX_BUY
sell: $TX_SELL
EOF
unset MY_LOCAL_KEY
