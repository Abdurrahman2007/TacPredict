export type ListingSort = "Trending" | "Most active" | "Ending soon" | "New";
export function sortListings<
  T extends {
    endsAt?: string;
    closeAt?: string;
    createdAt?: string;
    updatedAt?: string;
    observedAt?: string;
    participants?: number;
    native?: { volume24hAtomic: string };
  },
>(items: T[], sort?: ListingSort): T[];
