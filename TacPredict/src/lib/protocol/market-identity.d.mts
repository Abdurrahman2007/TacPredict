export type MarketIdentity = { chainId: number; onchainId: string; marketId: string };
export function protocolChain(chainId: number): 8453 | 84532;
export function onchainMarketId(value: string | bigint): bigint;
export function publicMarketId(chainId: number, value: string | bigint): string;
export function displayMarketId(value: string | bigint): string;
export function parsePublicMarketId(value: string, expectedChain?: number): MarketIdentity;
export function parseLegacyMarketId(value: string, explicitChain: number): MarketIdentity;
export function assertMarketIdentity(
  market: MarketIdentity,
  expectedChain?: number,
): MarketIdentity;
export function validMarketIdentity(market: MarketIdentity): boolean;
export function validPublicMarketId(value: string): boolean;
