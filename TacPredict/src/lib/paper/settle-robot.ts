/**
 * Client short-window paper settlement robot (5 / 15 / 30 min).
 * Records price-to-beat while a window is live; settles when it ends.
 * Virtual USDC paper ledger only — no Mainnet / no chain broadcast.
 */
import {
  ASSET_KEYS,
  windowStartFor,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { paperOutcome } from "@/lib/paper/feed-v1-quote";
import { settlePaperMarket } from "@/lib/paper/ledger";

const SHORT = [5, 15, 30] as const;
const OPEN_KEY = "tac-paper-open-v1";

type OpenMap = Record<string, number>;

function readOpens(): OpenMap {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as OpenMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeOpens(map: OpenMap) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(map));
  } catch {
    /* private mode */
  }
}

function marketKey(asset: UpDownAsset, startMs: number, minutes: number) {
  return `reference-${asset}-${startMs}-${minutes}`;
}

/** Call while a window is live to freeze the open / beat price once. */
export function rememberPaperOpen(
  asset: UpDownAsset,
  minutes: number,
  startMs: number,
  beat: number | null,
) {
  if (beat == null || !(beat > 0)) return;
  const id = marketKey(asset, startMs, minutes);
  const map = readOpens();
  if (map[id] != null) return;
  map[id] = beat;
  writeOpens(map);
}

/** Detail-page settle: known market id + verified start/end spots. Idempotent. */
export function runPaperResultRobot(input: {
  marketId: string;
  startPrice: number;
  endPrice: number;
  closedAtIso: string;
}): boolean {
  if (!(input.startPrice > 0) || !(input.endPrice > 0)) return false;
  const result = paperOutcome(input.startPrice, input.endPrice, true);
  if (!result) return false;
  const out = settlePaperMarket(input.marketId, result, {
    start: input.startPrice,
    end: input.endPrice,
    at: input.closedAtIso,
  });
  return out != null;
}

/** Settle one closed window when open+end prices are known. Idempotent. */
export function settleClosedPaperWindow(
  asset: UpDownAsset,
  minutes: number,
  startMs: number,
  endPrice: number | null,
): boolean {
  if (endPrice == null || !(endPrice > 0)) return false;
  const id = marketKey(asset, startMs, minutes);
  const map = readOpens();
  const startPrice = map[id];
  if (startPrice == null || !(startPrice > 0)) return false;
  const endMs = startMs + minutes * 60_000;
  const ok = runPaperResultRobot({
    marketId: id,
    startPrice,
    endPrice,
    closedAtIso: new Date(endMs).toISOString(),
  });
  if (ok) {
    delete map[id];
    writeOpens(map);
  }
  return ok;
}

/** One tick: remember live opens + settle the previous slot for each short duration. */
export function runPaperSettleTick(getPrice: (asset: UpDownAsset) => number | null, nowMs = Date.now()) {
  let settled = 0;
  for (const asset of ASSET_KEYS as UpDownAsset[]) {
    const price = getPrice(asset);
    if (price == null) continue;
    for (const minutes of SHORT) {
      const liveStart = windowStartFor(nowMs, minutes);
      rememberPaperOpen(asset, minutes, liveStart, price);
      const prevStart = liveStart - minutes * 60_000;
      if (settleClosedPaperWindow(asset, minutes, prevStart, price)) settled++;
    }
  }
  return settled;
}
