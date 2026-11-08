export declare const APPROVE_AMOUNT: bigint;
export declare const MAX_QUOTE_GAP_CENTS: number;
export declare const MIN_QUOTE_LIFE_SEC: number;
export declare const MIN_GAS_WEI: bigint;
export declare function toAtomic(text: string): bigint | null;
export declare function sharesToAtomic(shares: number): bigint | null;
export declare function quoteGapCents(pricePpm: number | string, shownCents: number): number;
export declare function quoteTooFar(pricePpm: number | string, shownCents: number | null | undefined): boolean;
export declare function quoteLifeSec(expiration: number | string, nowSec: number): number;
export declare function neededApprovals(input: {
  side: "buy" | "sell";
  cost: bigint | number | string;
  allowance: bigint | number | string;
  approvedForAll: boolean;
}): Array<"usdc" | "shares">;
export declare function isRejection(error: unknown): boolean;
export declare function reasonText(reason: string): string;
export declare function errorText(error: unknown): string;
