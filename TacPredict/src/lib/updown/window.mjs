/**
 * Pure helpers for Up/Down windows (5 min, 15 min, 12 hours, 24 hours). Windows are aligned to the UTC clock,
 * so "9:15 -> 9:20" is the same window for everybody. Every number comes from real Coinbase data
 * passed in by the caller; nothing here invents a price.
 */
export const ASSETS = {
  bitcoin: { product: "BTC-USD", name: "Bitcoin", short: "BTC", logo: "btc" },
  ethereum: { product: "ETH-USD", name: "Ethereum", short: "ETH", logo: "eth" },
  solana: { product: "SOL-USD", name: "Solana", short: "SOL", logo: "sol" },
  xrp: { product: "XRP-USD", name: "XRP", short: "XRP", logo: "xrp" },
  bnb: { product: "BNB-USD", name: "BNB", short: "BNB", logo: "bnb" },
};
export const ASSET_KEYS = ["bitcoin", "ethereum", "solana", "xrp", "bnb"];
/** Supported paper / UI durations (minutes). Matches VirtualPriceAMM scheduling set. */
export const DURATIONS = [5, 15, 30, 60, 720, 1440];
export const DISPLAY_DURATIONS = [5, 15, 30, 60, 720, 1440];
const SLUGS = { btc: "bitcoin", eth: "ethereum", sol: "solana", xrp: "xrp", bnb: "bnb" };

/** Coinbase candle sizes (seconds) that exist; the largest request is 300 candles. */
const GRANULARITIES = [60, 300, 900, 3600, 21600, 86400];
export const MAX_CANDLES = 300;
/** Smallest real candle size that covers `minutes` of history in one request. */
export function granularityFor(minutes) {
  const need = Math.max(1, Math.ceil(minutes));
  return GRANULARITIES.find((g) => (need * 60) / g <= MAX_CANDLES) ?? 86400;
}
/** How many past windows the "Past" list offers for each length. */
export function pastCountFor(minutes) {
  return minutes <= 30 ? 12 : minutes === 60 ? 6 : 3;
}

export function assetFromSlug(slug) {
  return SLUGS[String(slug).toLowerCase()] ?? null;
}
export function slugOf(asset) {
  return ASSETS[asset]?.short.toLowerCase() ?? "btc";
}
export function durationLabel(minutes) {
  if (minutes >= 60 && minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} min`;
}
export function parseDuration(value) {
  const n = Number(value);
  return DISPLAY_DURATIONS.includes(n) ? n : 5;
}

export function windowStartFor(nowMs, minutes) {
  const size = minutes * 60000;
  return Math.floor(nowMs / size) * size;
}
export function makeWindow(startMs, minutes) {
  return { start: startMs, end: startMs + minutes * 60000, minutes };
}
export function windowState(w, nowMs) {
  return nowMs < w.start ? "upcoming" : nowMs >= w.end ? "past" : "live";
}

/** Reads ?w=<start ms>; anything off-grid or out of range falls back to the current window. */
export function resolveWindow(param, nowMs, minutes) {
  const current = windowStartFor(nowMs, minutes);
  const n = Number(param);
  const size = minutes * 60000;
  if (
    !Number.isFinite(n) ||
    n % size !== 0 ||
    n < current - Math.max(24 * 3600000, 3 * size) ||
    n > current + 6 * size
  )
    return makeWindow(current, minutes);
  return makeWindow(n, minutes);
}

/** Newest-first past windows, the live one, then a few upcoming ones, oldest to newest. */
export function windowsAround(nowMs, minutes, past = 12, future = 3) {
  const current = windowStartFor(nowMs, minutes);
  const size = minutes * 60000;
  const out = [];
  for (let i = -past; i <= future; i += 1) out.push(makeWindow(current + i * size, minutes));
  return out;
}

/**
 * Open of the candle that starts exactly at the window start. `gran` is the candle size in ms
 * (60000 by default). A candle that does not start on the boundary is never used, so a coarse
 * candle can not stand in for a shorter window. Null if we do not have it.
 */
export function priceToBeat(candles, startMs, gran = 60000) {
  if (startMs % gran !== 0) return null;
  const hit = (candles ?? []).find((c) => c.time === startMs);
  return hit && hit.open > 0 ? hit.open : null;
}

/**
 * Final result of a finished window from real candles; null while data is missing. The close of
 * the candle that contains the last minute of the window is the last trade before the end.
 */
export function windowResult(candles, w, gran = 60000) {
  const open = priceToBeat(candles, w.start, gran);
  if (open === null || (w.end % gran !== 0 && gran > 60000)) return null;
  const lastMinute = w.end - 60000;
  const last = (candles ?? []).find((c) => c.time <= lastMinute && lastMinute < c.time + gran);
  if (!last || !(last.close > 0)) return null;
  return { open, close: last.close, outcome: last.close >= open ? "Up" : "Down" };
}

export function deltaInfo(current, beat) {
  if (!(current > 0) || !(beat > 0)) return null;
  const abs = current - beat;
  return {
    abs,
    pct: (abs / beat) * 100,
    direction: abs > 0 ? "up" : abs < 0 ? "down" : "flat",
  };
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** Real native market (if any) for this asset and exact window, matched by title and times. */
export function matchNativeMarket(markets, asset, w) {
  const info = ASSETS[asset];
  if (!info) return null;
  const re = new RegExp(`\\b(${info.name}|${info.short})\\b`, "i");
  return (
    (markets ?? []).find((m) => {
      if (
        (!m.virtual && !m.native) ||
        m.category !== "Crypto" ||
        !/up or down/i.test(m.title) ||
        !re.test(m.title)
      )
        return false;
      const start = Date.parse(m.startsAt ?? ""),
        end = Date.parse(m.endsAt ?? "");
      return Math.abs(start - w.start) <= 1500 && Math.abs(end - w.end) <= 1500;
    }) ?? null
  );
}

/**
 * Chart series for a window: minute candles for the earliest part, recent trades after them, then
 * live ticks. All real; later sources only replace earlier ones where they overlap.
 * Output: [{time (ms), price}] sorted by time and clipped to [start, min(now, end)].
 */
export function seriesForWindow({ candles, trades, ticks, w, nowMs, gran = 60000 }) {
  const stop = Math.min(nowMs, w.end);
  const out = [];
  const firstTrade = trades?.length ? trades[0].time : Infinity;
  for (const c of candles ?? []) {
    if (c.time + gran > firstTrade) continue;
    if (c.time >= w.start && c.time <= stop) out.push({ time: c.time, price: c.open });
    const closeAt = c.time + gran - 1000;
    if (closeAt >= w.start && closeAt <= stop && closeAt < firstTrade)
      out.push({ time: closeAt, price: c.close });
  }
  for (const t of trades ?? []) if (t.time >= w.start && t.time <= stop) out.push(t);
  const lastKnown = out.length ? out[out.length - 1].time : -Infinity;
  for (const t of ticks ?? [])
    if (t.time > lastKnown && t.time >= w.start && t.time <= stop) out.push(t);
  return out.filter((p) => Number.isFinite(p.time) && p.price > 0).sort((a, b) => a.time - b.time);
}

/** Shrinks a long series to at most `max` points, always keeping the first and last. */
export function thin(points, max = 240) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i += 1) out.push(points[Math.round(i * step)]);
  return out;
}

export function formatUsd(price, asset) {
  if (!(price > 0)) return "$0";
  const digits = price < 10 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: price < 10 ? 3 : 2,
    maximumFractionDigits: asset === "solana" && price < 1000 ? Math.max(digits, 2) : digits,
  }).format(price);
}
