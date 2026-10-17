import { cryptoWindowTemplate } from "./market-templates.mjs";

/** Draft terms only. Does not invent prices, create contracts, sign, settle or enable trading. */
export function fiveMinuteTemplate(asset, now = Date.now()) {
  if (asset !== "bitcoin" && asset !== "ethereum") throw Error("BTC or ETH and a valid clock required");
  return cryptoWindowTemplate(asset, 5, now);
}
