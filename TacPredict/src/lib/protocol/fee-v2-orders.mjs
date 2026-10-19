/** REVIEW ONLY: isolated V2 typed-data boundary. No wallet, RPC, persistence or activation.
 * The caller MUST separately verify a registered V2 deployment and live maker signature
 * (including ERC1271), wallet ownership, balances, nonce/fills, and execution simulation.
 */
import { hashTypedData, isAddress, zeroAddress } from "viem";
import { feeV2OrderTypes, feeV2Quote } from "./fee-v2.mjs";
const names = feeV2OrderTypes.Order.map((f) => f.name);
const max = (bits) => (1n << BigInt(bits)) - 1n;
const UINT256 = max(256);
function uint(value, bits = 256) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value))
    throw Error("Canonical integer string required");
  const n = BigInt(value);
  if (n > max(bits)) throw Error("Integer overflow");
  return n;
}
function addr(value, allowZero = true) {
  if (
    typeof value !== "string" ||
    !isAddress(value, { strict: true }) ||
    (!allowZero && value.toLowerCase() === zeroAddress)
  )
    throw Error("Invalid address");
  return value.toLowerCase();
}
export function feeV2TypedData(order, context) {
  if (
    !order ||
    Object.getPrototypeOf(order) !== Object.prototype ||
    Object.keys(order).length !== names.length ||
    names.some((k) => !Object.hasOwn(order, k))
  )
    throw Error("Exact V2 order fields required");
  if (!context || ![8453, 84532].includes(context.chainId)) throw Error("Unsupported chain");
  const exchange = addr(context.exchange, false),
    treasury = addr(context.treasury, false);
  if (exchange === treasury) throw Error("Invalid V2 instance");
  // A V1 address must never be silently treated as the fee implementation.
  if (exchange === "0x7e5e40bae779ebabb2295ef6d009ab95b0307f85")
    throw Error("V1 Exchange is not FeeV2");
  if (typeof order.isBuy !== "boolean") throw Error("Boolean side required");
  const m = {
    marketId: uint(order.marketId),
    outcome: uint(order.outcome, 8),
    maker: addr(order.maker, false),
    isBuy: order.isBuy,
    price: uint(order.price),
    shares: uint(order.shares),
    nonce: uint(order.nonce),
    expiration: uint(order.expiration, 64),
    taker: addr(order.taker),
    feeBps: uint(order.feeBps, 16),
    feeRecipient: addr(order.feeRecipient, false),
    maxTotalCost: uint(order.maxTotalCost),
  };
  const count = uint(context.outcomeCount, 8),
    now = uint(context.nowSeconds, 64),
    close = uint(context.closeAtSeconds, 64);
  if (
    count < 2n ||
    count > 8n ||
    m.marketId !== uint(context.marketId) ||
    m.marketId === 0n ||
    m.outcome >= count ||
    m.price === 0n ||
    m.price >= 1000000n ||
    m.shares === 0n ||
    m.expiration <= now ||
    m.expiration > close ||
    m.feeBps !== 100n ||
    m.feeRecipient !== treasury ||
    (m.isBuy ? m.maxTotalCost === 0n : m.maxTotalCost !== 0n)
  )
    throw Error("Invalid V2 market/order/fee consent");
  // Returning typed data does NOT imply signature/instance authorization or reserves.
  const typed = {
    domain: {
      name: "TacPredictFeeExchange",
      version: "2",
      chainId: context.chainId,
      verifyingContract: exchange,
    },
    types: feeV2OrderTypes,
    primaryType: "Order",
    message: m,
  };
  return { typedData: typed, orderId: hashTypedData(typed), executionAuthorized: false };
}
export function feeV2DebitDisclosure(quote, priorScopeNotionalAtomic) {
  const expected = feeV2Quote(priorScopeNotionalAtomic, quote.notionalAtomic);
  if (quote.feeAtomic !== expected.feeAtomic)
    throw Error("Fee does not match cumulative 100bps rounding");
  const cost = uint(quote.notionalAtomic),
    fee = uint(quote.feeAtomic),
    debit = uint(quote.buyerDebitAtomic);
  if (
    cost === 0n ||
    cost + fee > UINT256 ||
    cost + fee !== debit ||
    uint(quote.sellerReceiptAtomic) !== cost ||
    quote.feeBps !== "100"
  )
    throw Error("Invalid V2 debit disclosure");
  return {
    tradeAmountAtomic: cost.toString(),
    additionalBuyerFeeAtomic: fee.toString(),
    totalBuyerDebitAtomic: debit.toString(),
    sellerReceiptAtomic: cost.toString(),
    feeBps: "100",
    feeStatus: "REFUNDABLE_ESCROW",
    feeRefundRecipient: "ORIGINAL_BUYER",
    feeReleaseCondition: "FINAL_RESOLVED_NON_VOID",
    principalRefundSeparate: true,
    executionAuthorized: false,
  };
}
