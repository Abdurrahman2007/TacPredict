export function money(value: string | bigint | null | undefined, hidden?: boolean): string;
export function visiblePositions<
  T extends {
    chainId: number;
    title: string;
    status: string;
    sharesAtomic: string;
    valueAtomic: string | null;
    updatedAt: string;
  },
>(items: T[], search?: string, sort?: string, descending?: boolean, activeOnly?: boolean): T[];
export function remainingShares(shares: string, filled: string): string;

export function selectedWalletSummary<
  T extends {
    chainId: number;
    wallet: string;
    valueAtomic: string | null;
    claimableAtomic: string;
  },
>(
  positions: T[],
  address: string | null | undefined,
  verifiedWallets: string[],
  ready: boolean,
): {
  verified: boolean;
  positions: T[];
  markedAtomic: bigint | null;
  claimableAtomic: bigint | null;
};
export function filterPortfolioPositions<
  T extends { marketId: string; status: string; updatedAt: string },
>(
  items: T[],
  markets: { marketId: string; category: string; subcategory: string | null }[],
  category?: string,
  state?: string,
  since?: string,
): T[];
