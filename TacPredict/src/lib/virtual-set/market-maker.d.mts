export declare const PRICE_SCALE: 1000000;
export declare const UP: 0;
export declare const DOWN: 1;
export declare const MIN_PRICE_PPM: 10000;
export declare const MAX_PRICE_PPM: 990000;
export declare const MAX_TTL_SEC: 30;
export declare const MIN_REMAINING_SEC: 2;
export type MakerBook = { bid: number; ask: number };
export type MakerQuote = { fairUpPpm: number; up: MakerBook; down: MakerBook };
export type MakerOrder = {
  marketId: bigint;
  outcome: 0 | 1;
  maker: `0x${string}`;
  isBuy: boolean;
  price: bigint;
  shares: bigint;
  nonce: bigint;
  expiration: bigint;
  taker: `0x${string}`;
};
export type ExchangeDomain = { name: "TacPredictVirtualExchange"; version: "1"; chainId: number; verifyingContract: `0x${string}` };
export declare const ORDER_TYPES: { Order: readonly { name: string; type: string }[] };
export declare function exchangeDomain(input: { chainId: number; exchange: string }): ExchangeDomain;
export declare function makerFairUpPpm(input: { spot: number; strike: number; remainingSec: number; sigmaPpm: number }): number | null;
export declare function makerQuote(input: { upPpm: number; halfSpreadPpm?: number }): MakerQuote;
export declare function userPrice(quote: MakerQuote, outcome: 0 | 1, userSide: "buy" | "sell"): number;
export declare function makerOrder(input: {
  marketId: bigint | number | string;
  outcome: 0 | 1;
  maker: string;
  userSide: "buy" | "sell";
  quote: MakerQuote;
  shares: bigint | number | string;
  nonce: bigint | number | string;
  closeAt: number;
  now: number;
  taker: string;
  ttlSec?: number;
}): MakerOrder;
export declare function signMakerOrder(
  account: { signTypedData(args: unknown): Promise<`0x${string}`> },
  domain: ExchangeDomain,
  order: MakerOrder,
): Promise<`0x${string}`>;
export declare function fillCost(price: bigint | number, shares: bigint | number): bigint;
