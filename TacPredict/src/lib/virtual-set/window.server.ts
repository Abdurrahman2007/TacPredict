/**
 * Status of one Up/Down window for the trade sheet: is on-chain trading switched on, is this window one that trades on
 * chain, and is its market ready for a quote. Looking at a window also marks the page as "watched" so the keeper
 * prepares its markets (and spends nothing for pages nobody is on).
 */
import { marketByKey, markHot, vdb } from "./db.server";
import { keeperTick } from "./keeper.server";
import { vsetServerConfigured } from "./onchain.server";
import { isVsetPair, marketKey, parseMarketKey, quoteBlocker, type VsetAsset } from "./schedule.mjs";

export type OnchainWindow = {
  /** On-chain trading is switched on for this deployment. */
  enabled: boolean;
  /** This asset and length trade on chain (5m and 15m for now). */
  supported: boolean;
  /** A quote can be requested right now. */
  ready: boolean;
  /** Why not ready yet (preparing, not_open, closing, ...), or null. */
  reason: string | null;
  key: string | null;
  marketId: number | null;
};

export const onchainEnabled = () => process.env["VSET_TRADING_ENABLED"] === "1" && vsetServerConfigured();

let lastNudge = 0;

export async function onchainWindow(input: {
  asset: VsetAsset;
  minutes: number;
  start: number;
}): Promise<OnchainWindow> {
  const off: OnchainWindow = {
    enabled: false,
    supported: false,
    ready: false,
    reason: null,
    key: null,
    marketId: null,
  };
  if (!onchainEnabled()) return off;
  const key = marketKey(input.asset, input.start, input.minutes);
  if (!isVsetPair(input.asset, input.minutes) || !parseMarketKey(key)) return { ...off, enabled: true };

  const db = await vdb();
  await markHot(db, input.asset, input.minutes);
  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = input.start / 1000 + input.minutes * 60;
  if (nowSec >= endSec) return { ...off, enabled: true, supported: true, reason: "ended", key };

  let row = await marketByKey(db, key);
  let blocker = quoteBlocker(row, nowSec);
  const needsWork = blocker === "no_market" || blocker === "not_created" || blocker === "not_ready";
  const soon = input.start / 1000 <= nowSec + input.minutes * 60;
  if (needsWork && soon && Date.now() - lastNudge > 8000) {
    lastNudge = Date.now();
    try {
      await keeperTick();
    } catch {
      // The cron run keeps trying; the page simply shows "preparing" a little longer.
    }
    row = await marketByKey(db, key);
    blocker = quoteBlocker(row, nowSec);
  }
  // The price to beat is fetched at quote time, so a missing strike alone does not hold the window back.
  const ready = blocker === null || blocker === "no_strike";
  return {
    enabled: true,
    supported: true,
    ready,
    reason: ready ? null : blocker === "no_market" || blocker === "not_created" ? "preparing" : blocker,
    key,
    marketId: row?.market_id ?? null,
  };
}
