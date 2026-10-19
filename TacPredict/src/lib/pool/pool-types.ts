/** Plain, serializable shapes the pool server functions return (numbers and strings only). */
export type PoolRound = {
  up: string;
  down: string;
  feeBps: number;
  state: number;
  result: number;
  startPrice: string;
  endPrice: string;
  startObservedAt: number;
  endObservedAt: number;
  claimOpensAt: number;
};
export type PoolPosition = {
  up: string;
  down: string;
  claimed: boolean;
  payout: string;
  refund: boolean;
  ready: boolean;
};
export type PoolConfig = {
  address: string | null;
  feeBps: number;
  minBet: string;
  maxPerUser: string;
  maxPool: string;
  paused: boolean;
  ownerBalance: string;
  treasury: string;
  /** "bitcoin:5" -> true when the admin turned that series on. */
  series: Record<string, boolean>;
};
