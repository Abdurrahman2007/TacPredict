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
