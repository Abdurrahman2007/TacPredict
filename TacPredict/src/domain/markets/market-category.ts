import type { MarketCategory } from "./types";

/** Metadata wins over title heuristics. Unknown categories stay Other. */
export function categoryFor(title: string, sportsMarketType?: string): MarketCategory {
  const value = title.toLowerCase();
  if (sportsMarketType) return "Sports";
  if (
    /\b(election|president|presidential|government|congress|senate|minister|war|ceasefire|blockade|democratic|republican)\b/.test(
      value,
    )
  )
    return "News";
  if (/\b(bitcoin|btc|ethereum|eth|solana|crypto|token|coin)\b/.test(value)) return "Crypto";
  if (
    /\b(nba|nfl|mlb|nhl|football|soccer|cricket|tennis|championship|league|esports|atp|wta)\b|\bvs\.?\s/.test(
      value,
    )
  )
    return "Sports";
  if (
    /\b(ai|artificial intelligence|apple|google|microsoft|openai|technology|spacex)\b/.test(value)
  )
    return "Technology";
  if (/\b(price|market cap|company|fed|rate cut|gdp|recession|ipo)\b/.test(value))
    return "Business";
  if (/\b(movie|album|award|celebrity|culture)\b/.test(value)) return "Culture";
  return "Other";
}
