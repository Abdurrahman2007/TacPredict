export const FEE_V2_BPS: bigint;
export const feeV2OrderTypes: { Order: { name: string; type: string }[] };
export function feeV2Quote(
  priorNotionalAtomic: string,
  executedCostAtomic: string,
): {
  notionalAtomic: string;
  feeAtomic: string;
  buyerDebitAtomic: string;
  sellerReceiptAtomic: string;
  feeBps: string;
  feeTreatment: string;
};
