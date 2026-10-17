/**
 * TacPredict has three public sections: Crypto (Up/Down and price markets), Football and Cricket.
 * Football and Cricket are stored as category "Sports" with subcategory "Football" / "Cricket", so
 * the database constraint on `category` does not need to change. Everything else is hidden.
 */
export const SECTIONS = ["Crypto", "Football", "Cricket"];
export const SECTION_FILTERS = ["All", ...SECTIONS];

const FOOTBALL =
  /\b(football|soccer|la ?liga|laliga|champions league|ucl|uefa|premier league|serie a|bundesliga|ligue 1|real madrid|barcelona|atl[eé]tico|fifa|world cup)\b/i;
const CRICKET = /\b(cricket|t20i?|ipl|bpl|odi|test match|icc|asia cup|bangladesh)\b/i;

/** Section for a market-like `{ category, subcategory?, title? }`, or null when it is not shown. */
export function sectionOf({ category, subcategory, title } = {}) {
  if (category === "Crypto") return "Crypto";
  if (category === "Football" || category === "Cricket") return category;
  if (category !== "Sports") return null;
  if (subcategory === "Football" || subcategory === "Cricket") return subcategory;
  if (subcategory) return null;
  const text = String(title ?? "");
  if (CRICKET.test(text)) return "Cricket";
  if (FOOTBALL.test(text)) return "Football";
  return null;
}

/** Same, for the app's Market objects (native markets carry the subcategory). */
export function marketSection(market) {
  if (!market) return null;
  return sectionOf({
    category: market.category,
    subcategory: market.native?.subcategory ?? null,
    title: market.title,
  });
}

/** Fields stored in the market terms for a section. */
export function termsForSection(section) {
  if (section === "Crypto") return { category: "Crypto" };
  if (section === "Football" || section === "Cricket") return { category: "Sports", subcategory: section };
  throw new Error("Choose Crypto, Football or Cricket");
}
