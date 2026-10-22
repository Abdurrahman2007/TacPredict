import { marketSection, sectionOf } from "../../domain/markets/sections.mjs";
export const HOME_FEEDS = ["Trending", "Live", "Upcoming", "New"];
export const MARKET_SORTS = ["Trending", "Most active", "Ending soon", "New"];
export const SPORTS_FILTERS = ["All", "Football", "Cricket"];
export function isSportsListing(market) {
  const section = marketSection(market) ?? sectionOf(market);
  return section === "Football" || section === "Cricket";
}
