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
let nudgeInFlight: Promise<void> | null = null;

function runKeeper(): Promise<void> {
  if (nudgeInFlight) return nudgeInFlight;
  lastNudge = Date.now();
  nudgeInFlight = keeperTick()
    .catch(() => undefined)
    .then(() => {
      nudgeInFlight = null;
    });
  return nudgeInFlight;
}

export async function onchainWindow(input: {
  asset: VsetAsset;
  minutes: number;
  start: number;
  /** When true, wait longer for create/stock (user tapped retry / about to trade). */
  awaitKeeper?: boolean | undefined;
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
  const needsWork =
    blocker === "no_market" ||
    blocker === "not_created" ||
    blocker === "not_ready" ||
    blocker === "not_open";
  const soon = input.start / 1000 <= nowSec + input.minutes * 60;

  if (needsWork && soon) {
    // Cap wait so Cloudflare requests don't hang forever, but give create/stock time to land.
    // Prepare (user tap / about-to-trade) always nudges — don't skip when a recent soft poll already ran.
    const deadline = Date.now() + (input.awaitKeeper ? 22_000 : 8_000);
    const softGapMs = 1_500;
    while (Date.now() < deadline) {
      const canStart =
        Boolean(input.awaitKeeper) || Date.now() - lastNudge >= softGapMs || Boolean(nudgeInFlight);
      if (!canStart) break;
      const slice = Math.min(4_000, Math.max(500, deadline - Date.now()));
      await Promise.race([
        runKeeper(),
        new Promise<void>((resolve) => setTimeout(resolve, slice)),
      ]);
      row = await marketByKey(db, key);
      blocker = quoteBlocker(row, Math.floor(Date.now() / 1000));
      const stillNeeds =
        blocker === "no_market" ||
        blocker === "not_created" ||
        blocker === "not_ready";
      // not_open means the market exists — waiting longer won't open it early.
      if (!stillNeeds) break;
      if (Date.now() >= deadline) break;
      await new Promise<void>((resolve) => setTimeout(resolve, input.awaitKeeper ? 700 : 200));
    }
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
