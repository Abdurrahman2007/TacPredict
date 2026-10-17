export type Section = "Crypto" | "Football" | "Cricket";
export const SECTIONS: readonly Section[];
export const SECTION_FILTERS: readonly ["All", ...Section[]];
type Like = { category?: string | undefined; subcategory?: string | null | undefined; title?: string | undefined };
export function sectionOf(market?: Like): Section | null;
export function marketSection(
  market:
    | { category: string; title: string; native?: { subcategory: string | null } | undefined }
    | null
    | undefined,
): Section | null;
export function termsForSection(section: Section): { category: "Crypto" | "Sports"; subcategory?: "Football" | "Cricket" };
