import type { Address, Hex } from "viem";
export type VirtualDeployment = {
  id: string;
  chainId: 8453 | 84532 | 31337;
  engine: Address;
  codeHash: Hex;
  startBlock: string;
  enabled: boolean;
  model?: "fpmm-v1" | "feed-v1";
};
export type VirtualMarketRef = { deployment: VirtualDeployment; onchainId: string };
export type TradeIntent = {
  wallet: Address;
  marketId: string;
  outcome: number;
  isBuy: boolean;
  input: string;
  nonce: string;
};
export type VirtualEvent = {
  name: string;
  args: Record<string, string | number | boolean>;
  wallet: string | null;
  marketId: string | null;
  txHash: Hex;
  blockHash: Hex;
  blockNumber: string;
  logIndex: number;
};
export type VirtualPosition = {
  marketId: string;
  outcome: number;
  shares: string;
  basis: string;
};
export type VirtualAccount = {
  wallet: string;
  balance: string;
  positions: VirtualPosition[];
  realizedPnl: string;
  unrealizedPnl: string;
  positionValue: string;
  claimable: string;
  trades: VirtualEvent[];
  blockNumber: string;
  finalizedBlock: string;
};
