#!/usr/bin/env bash
# Resume after successful createPool + configurePricePolicy.
# Root cause of step-4 fail: baked campStarts was already < block.timestamp → Invalid().
# Uses LIVE startsAt. Key stays local — never paste into Cursor.
set -euo pipefail

ENGINE=0xCF59F3Ff524cC1bD4e11177937D3BCBE62860E46
FEED=0x657F55EdDeb1ab37F1bebF99824147B60fC47Aca
SEQ=0x5408ef3943d478E0d2F039C6C95a561A9C24eD02
ADMIN=0x6397A026560e7b66584F087739b15AE2bda8610f
RPC=${VIRTUAL_TESTNET_RPC_URL:-https://sepolia.base.org}
PRICE=10000000000000
# Live pool #1 openAt / capture window (from createPool tx)
OPEN=1793268818
CAP_DEAD=$((OPEN + 300))
LEAF=0x42823e463e57183fb03e6c089f335b77e614085b319e91a0260cc85c13627811

if [[ -z "${MY_LOCAL_KEY:-}" ]]; then
  echo "export MY_LOCAL_KEY locally first (0x6397…). Never paste into chat."
  exit 1
fi

txhash() { jq -r '.transactionHash // .hash // empty'; }
wait_until() {
  local target=$1 label=$2
  while true; do
    local now; now=$(date -u +%s)
    if (( now >= target )); then break; fi
    echo "… waiting for $label ($((target - now))s)"
    sleep 3
  done
}

NOW=$(date -u +%s)
echo "now=$NOW openAt=$OPEN captureDeadline=$CAP_DEAD eta_open=$((OPEN-NOW))s"
if (( NOW > CAP_DEAD )); then
  echo "FATAL: capture window closed. Need a new createPool (new openAt)."
  exit 1
fi

echo "=== 4) configureMonthlyCampaign (live startsAt) ==="
MONTH=$(cast keccak "2026-10-qa-resume-$NOW")
ELIG=$(cast keccak "sepolia-qa-eligibility")
CAMP_START=$(( $(date -u +%s) + 45 ))
CAMP_END=$(( CAMP_START + 30*24*3600 ))
TX_CAMP=$(cast send "$ENGINE" \
  "configureMonthlyCampaign(bytes32,bytes32,uint128,uint64,uint64,uint128,bytes32)" \
  "$MONTH" "$LEAF" 100000000 "$CAMP_START" "$CAMP_END" 100000000 "$ELIG" \
  --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "configureMonthlyCampaign $TX_CAMP (startsAt=$CAMP_START)"

echo "=== 5) claimGrant ==="
wait_until "$CAMP_START" campStarts
TX_CLAIM=$(cast send "$ENGINE" "claimGrant(uint256,uint128,bytes32[])" 1 100000000 "[]" \
  --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "claimGrant $TX_CLAIM"
echo "cash=$(cast call "$ENGINE" "cash(address)(uint128)" "$ADMIN" --rpc-url "$RPC")"

echo "=== 6) openAt → FEED round 2 + captureStart ==="
wait_until "$OPEN" openAt
NOW=$(date -u +%s)
if (( NOW > CAP_DEAD )); then
  echo "FATAL: past captureDeadline"
  exit 1
fi
# Keep SEQ "up" (>3600s since)
cast send "$SEQ" "push(int256,uint256)" 0 $(($(date -u +%s)-4001)) --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$NOW" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
ROUND=$(cast call "$FEED" "latestRoundData()(uint80,int256,uint256,uint256,uint80)" --rpc-url "$RPC" | awk 'NR==1{print $1}')
TX_CAP=$(cast send "$ENGINE" "captureStart(uint256,uint80)" 1 "$ROUND" \
  --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "captureStart $TX_CAP (round=$ROUND)"
echo "startPrice=$(cast call "$ENGINE" "startPrice(uint256)(uint128)" 1 --rpc-url "$RPC")"

echo "=== 7) Buy 5 vUSDC Up ==="
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$(date -u +%s)" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
NONCE=$(cast call "$ENGINE" "actionNonce(address)(uint256)" "$ADMIN" --rpc-url "$RPC" | awk '{print $1}')
DEADLINE=$(( $(date -u +%s) + 900 ))
TX_BUY=$(cast send "$ENGINE" "buy(uint256,uint8,uint64,uint64,uint64,uint64,uint256)" \
  1 0 5000000 1 1 "$DEADLINE" "$NONCE" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "buy $TX_BUY"

echo "=== 8) Sell all Up shares ==="
cast send "$FEED" "push(int256,uint256)" "$PRICE" "$(date -u +%s)" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" >/dev/null
SHARES=$(cast call "$ENGINE" "positions(uint256,address,uint8)(uint64,uint128,int256)" 1 "$ADMIN" 0 --rpc-url "$RPC" | awk 'NR==1{print $1}')
NONCE2=$(cast call "$ENGINE" "actionNonce(address)(uint256)" "$ADMIN" --rpc-url "$RPC" | awk '{print $1}')
DEADLINE2=$(( $(date -u +%s) + 900 ))
TX_SELL=$(cast send "$ENGINE" "sell(uint256,uint8,uint64,uint64,uint64,uint64,uint256)" \
  1 0 "$SHARES" 1 2 "$DEADLINE2" "$NONCE2" --rpc-url "$RPC" --private-key "$MY_LOCAL_KEY" --json | txhash)
echo "sell $TX_SELL"

echo
echo "=== HASHES (paste back — hashes only) ==="
cat <<EOF
createPool: 0xf2f5f6783062c0a6ea0d9cac44e66680a4900ae761f99c4def6e633328e42519
configurePricePolicy: 0x3bfc160c44b81d261f694d78713988ca596c7c20a3bc3b460faba14799be38d5
configureMonthlyCampaign: $TX_CAMP
claimGrant: $TX_CLAIM
captureStart: $TX_CAP
buy: $TX_BUY
sell: $TX_SELL
EOF
unset MY_LOCAL_KEY
