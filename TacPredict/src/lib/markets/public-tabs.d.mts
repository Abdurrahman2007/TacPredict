export const HOME_FEEDS: readonly ["Trending", "Live", "Upcoming", "New"];
export const MARKET_SORTS: readonly ["Trending", "Most active", "Ending soon", "New"];
export const SPORTS_FILTERS: readonly ["All", "Football", "Cricket"];
export function isSportsListing(market: {
  category?: string;
  title?: string;
  subcategory?: string | null;
  native?: { subcategory: string | null } | undefined;
}): boolean;
