import { z } from "zod";
import { parseAbi, parseUnits, formatUnits, type Address } from "viem";
const uint = z
  .string()
  .regex(/^\d{1,78}$/)
  .refine((v) => BigInt(v) < 2n ** 256n, "Exceeds uint256");
export const signedOrderSchema = z.object({
  marketId: uint,
  outcome: z.number().int().min(0).max(7),
  maker: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  isBuy: z.boolean(),
  price: uint,
  shares: uint,
  nonce: uint,
  expiration: uint.refine((v) => BigInt(v) < 2n ** 64n),
  taker: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});
export const signatureSchema = z.string().regex(/^0x(?:[0-9a-fA-F]{2}){1,8192}$/);
export type SignedOrder = z.infer<typeof signedOrderSchema>;
export const orderTypes = {
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
  ],
} as const;
export const exchangeAbi = parseAbi([
  "function filledShares(bytes32) view returns(uint256)",
  "function cancelled(bytes32) view returns(bool)",
  "function minimumNonce(address) view returns(uint256)",
  "function fillOrder((uint256 marketId,uint8 outcome,address maker,bool isBuy,uint256 price,uint256 shares,uint256 nonce,uint64 expiration,address taker),bytes signature,uint256 quantity)",
  "function cancelOrder((uint256 marketId,uint8 outcome,address maker,bool isBuy,uint256 price,uint256 shares,uint256 nonce,uint64 expiration,address taker))",
]);
export const positionAbi = parseAbi([
  "function tokenId(uint256,uint8) view returns(uint256)",
  "function balanceOf(address,uint256) view returns(uint256)",
  "function isApprovedForAll(address,address) view returns(bool)",
  "function setApprovalForAll(address,bool)",
  "function split(uint256,uint256)",
  "function merge(uint256,uint256)",
  "function claimable(uint256,address) view returns(uint256)",
]);
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
export const settlementAbi = parseAbi(["function claim(uint256)", "function refund(uint256)"]);
export const registryReadAbi = parseAbi([
  "function isTradingOpen(uint256) view returns(bool)",
  "function collateralToken() view returns(address)",
]);
export function orderMessage(o: SignedOrder) {
  return {
    ...o,
    maker: o.maker as Address,
    taker: o.taker as Address,
    marketId: BigInt(o.marketId),
    price: BigInt(o.price),
    shares: BigInt(o.shares),
    nonce: BigInt(o.nonce),
    expiration: BigInt(o.expiration),
  };
}
export function usdcAtomic(value: string) {
  if (!/^\d{1,24}(\.\d{1,6})?$/.test(value))
    throw Error("Enter a positive amount, up to six decimals.");
  const n = parseUnits(value, 6);
  if (n <= 0n) throw Error("Amount must be positive.");
  return n;
}
export function limitQuote(amount: string, price: string) {
  const cost = usdcAtomic(amount),
    p = usdcAtomic(price);
  if (p >= 1000000n) throw Error("Share price must be between 0 and 1 USDC.");
  const shares = (cost * 1000000n) / p;
  if (!shares) throw Error("Amount too small.");
  return {
    budgetAtomic: cost,
    sharesAtomic: shares,
    priceAtomic: p,
    maximumCostAtomic: (shares * p + 999999n) / 1000000n,
    potentialPayout: formatUnits(shares, 6),
  };
}
