import type { Address, Hash, TypedDataDefinition } from "viem";
export type FeeV2WireOrder = {
  marketId: string;
  outcome: string;
  maker: string;
  isBuy: boolean;
  price: string;
  shares: string;
  nonce: string;
  expiration: string;
  taker: string;
  feeBps: string;
  feeRecipient: string;
  maxTotalCost: string;
};
export type FeeV2OrderContext = {
  chainId: 8453 | 84532;
  exchange: Address;
  treasury: Address;
  marketId: string;
  outcomeCount: string;
  nowSeconds: string;
  closeAtSeconds: string;
};
export function feeV2TypedData(
  order: FeeV2WireOrder,
  context: FeeV2OrderContext,
): {
  typedData: TypedDataDefinition;
  orderId: Hash;
  executionAuthorized: false;
};
export function feeV2DebitDisclosure(
  quote: {
    notionalAtomic: string;
    feeAtomic: string;
    buyerDebitAtomic: string;
    sellerReceiptAtomic: string;
    feeBps: string;
  },
  priorScopeNotionalAtomic: string,
): {
  tradeAmountAtomic: string;
  additionalBuyerFeeAtomic: string;
  totalBuyerDebitAtomic: string;
  sellerReceiptAtomic: string;
  feeBps: "100";
  feeStatus: "REFUNDABLE_ESCROW";
  feeRefundRecipient: "ORIGINAL_BUYER";
  feeReleaseCondition: "FINAL_RESOLVED_NON_VOID";
  principalRefundSeparate: true;
  executionAuthorized: false;
};
