/** Titles and descriptions for the Up/Down series. Pure helpers shared by the admin form and the page. */
export const COPY_BUCKET = "pool-config";
export const COPY_FILE = "series-copy.json";
const NAMES = { bitcoin: "Bitcoin", ethereum: "Ethereum", solana: "Solana", bnb: "BNB" };
export const ASSET_NAMES = NAMES;

export function defaultCopy(asset) {
  const name = NAMES[asset] ?? asset;
  return {
    title: `${name} Up or Down`,
    description: `Will ${name} be higher or lower at the end of the round than at the start? Pick Up or Down, then everyone on the winning side shares the pool.`,
  };
}

/** Removes control characters and trims; returns an error string or the cleaned value. */
export function cleanCopy(input) {
  const strip = (v) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const title = strip(input?.title);
  const description = strip(input?.description);
  if (title.length < 3 || title.length > 80) return { error: "The title needs 3 to 80 characters." };
  if (description.length < 10 || description.length > 400) return { error: "The description needs 10 to 400 characters." };
  if (/https?:\/\/|<[^>]*>/i.test(title + description)) return { error: "Links and markup are not allowed in the title or description." };
  return { title, description };
}

/** What the page shows for an asset: the saved copy, or the built-in default. */
export function copyFor(saved, asset) {
  const row = saved?.[asset];
  const base = defaultCopy(asset);
  return {
    title: typeof row?.title === "string" && row.title ? row.title : base.title,
    description: typeof row?.description === "string" && row.description ? row.description : base.description,
    custom: Boolean(row?.title),
  };
}
