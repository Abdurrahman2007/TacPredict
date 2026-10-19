/** REVIEW ONLY. No deployed address, wallet execution, automatic activation or revenue recording. */
const MAX = (1n << 256n) - 1n;
export const FEE_V2_BPS = 100n;
export const feeV2OrderTypes = {
  Order: [
    { name: "marketId", type: "uint256" },
    { name: "outcome", type: "uint8" },
    { name: "maker", type: "address" },
    { name: "isBuy", type: "bool" },
    { name: "price", type: "uint256" },
    { name: "shares", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiration", type: "uint64" },
    { name: "taker", type: "address" },
    { name: "feeBps", type: "uint16" },
    { name: "feeRecipient", type: "address" },
    { name: "maxTotalCost", type: "uint256" },
  ],
};
function atomic(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value))
    throw Error("Canonical atomic decimal string required");
  const n = BigInt(value);
  if (n > MAX) throw Error("uint256 overflow");
  return n;
}
export function feeV2Quote(priorNotionalAtomic, executedCostAtomic) {
  const before = atomic(priorNotionalAtomic),
    cost = atomic(executedCostAtomic);
  if (cost === 0n || before + cost > MAX) throw Error("Invalid execution notional");
  const fee = ((before + cost) * FEE_V2_BPS) / 10000n - (before * FEE_V2_BPS) / 10000n;
  if (cost + fee > MAX) throw Error("uint256 overflow");
  return {
    notionalAtomic: cost.toString(),
    feeAtomic: fee.toString(),
    buyerDebitAtomic: (cost + fee).toString(),
    sellerReceiptAtomic: cost.toString(),
    feeBps: "100",
    feeTreatment:
      "Escrowed until final resolution. VOID returns execution fees to the original buyer separately from the share payout.",
  };
}
