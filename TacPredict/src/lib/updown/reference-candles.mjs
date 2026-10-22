/** Strictly retain observed OHLC; malformed/future rows never become invented candles. */
export function parseReferenceCandles(payload, now) {
  if (!payload || !Array.isArray(payload.candles)) throw new Error("Unexpected reference candles");
  const rows = new Map();
  for (const row of payload.candles) {
    if (!row || typeof row !== "object") continue;
    const time = Number(row.start) * 1000;
    const [open, high, low, close] = [row.open, row.high, row.low, row.close].map(Number);
    if (
      ![time, open, high, low, close].every(Number.isFinite) ||
      time <= 0 ||
      time > now ||
      Math.min(open, high, low, close) <= 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      low > high
    )
      continue;
    rows.set(time, { time, open, high, low, close });
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}
