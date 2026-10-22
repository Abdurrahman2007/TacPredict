/** Keep real observations inside the selected interval; never substitute a different day. */
export function chartWindow(points, start, end) {
  return [
    ...new Map(
      points
        .filter(
          (p) =>
            Number.isFinite(p.time) &&
            Number.isFinite(p.price) &&
            p.price > 0 &&
            p.time >= start &&
            p.time <= end,
        )
        .map((p) => [p.time, p]),
    ).values(),
  ].sort((a, b) => a.time - b.time);
}

/** A sparse/future window may show recent observations, but never call them window data. */
export function chartView(points, selected, now) {
  const end = Math.min(selected.end, now);
  const inWindow = chartWindow(points, selected.start, end);
  const recent = inWindow.length < 2;
  const series = recent ? chartWindow(points, end - 3600000, end) : inWindow;
  const first = series[0];
  const last = series.at(-1);
  return {
    series,
    mode: recent ? "recent" : "window",
    range:
      first && last && first.time < last.time
        ? {
            start: first.time,
            end: last.time,
            minutes: Math.max(1, Math.ceil((last.time - first.time) / 60000)),
          }
        : first
          ? { start: first.time - 60000, end: first.time, minutes: 1 }
          : selected,
  };
}

/** An exact observed boundary, never a nearest sample or a future reading. */
export function boundaryObservation(points, boundary, now) {
  return (
    points.findLast(
      (p) => p.time === boundary && p.time <= now && Number.isFinite(p.price) && p.price > 0,
    )?.price ?? null
  );
}

/** OHLC of observed samples only. Empty buckets stay empty; this is not oracle evidence. */
export function observedCandles(points, range) {
  const observations = chartWindow(points, range.start, range.end);
  const gaps = observations
    .slice(1)
    .map((p, i) => p.time - observations[i].time)
    .filter((g) => g > 0)
    .sort((a, b) => a - b);
  const cadence = gaps[Math.floor(gaps.length / 2)] ?? 0;
  const size = Math.max(
    60000,
    cadence * 2,
    Math.ceil((range.end - range.start) / 60 / 60000) * 60000,
  );
  const groups = new Map();
  for (const p of observations) {
    const key = Math.floor(p.time / size) * size;
    const prev = groups.get(key);
    if (prev) {
      prev.high = Math.max(prev.high, p.price);
      prev.low = Math.min(prev.low, p.price);
      prev.close = p.price;
    } else
      groups.set(key, { time: p.time, open: p.price, high: p.price, low: p.price, close: p.price });
  }
  return [...groups.values()];
}

/** First actual reference sample after the boundary, within the published 3-minute grace. */
export function referenceObservation(points, boundary, now) {
  return chartWindow(points, boundary, Math.min(now, boundary + 180000))[0]?.price ?? null;
}

/** Price chart context is independent of the prediction duration; retain actual timestamps. */
export function referenceChartView(points, selected, now) {
  const end = Math.min(selected.end, now);
  const start = Math.min(selected.start, end - 30 * 60000);
  const series = chartWindow(points, start, end);
  const first = series[0],
    last = series.at(-1);
  return {
    series,
    mode: start < selected.start ? "recent" : "window",
    range:
      first && last && first.time < last.time
        ? {
            start: first.time,
            end: last.time,
            minutes: Math.max(1, (last.time - first.time) / 60000),
          }
        : first
          ? { start: first.time - 60000, end: first.time, minutes: 1 }
          : selected,
  };
}

export function nearestObservation(points, target) {
  return points.reduce(
    (best, p) => (!best || Math.abs(p.time - target) < Math.abs(best.time - target) ? p : best),
    null,
  );
}
/** Update only with actual post-snapshot ticks. Never fill missing minutes or invent OHLC. */
export function mergeObservedCandles(candles, ticks, gran, asOf, now) {
  const rows = new Map(candles.filter((c) => c.time <= now).map((c) => [c.time, { ...c }]));
  for (const p of chartWindow(ticks, asOf + 1, now)) {
    const time = Math.floor(p.time / gran) * gran;
    const c = rows.get(time);
    if (c) {
      c.high = Math.max(c.high, p.price);
      c.low = Math.min(c.low, p.price);
      c.close = p.price;
    } else rows.set(time, { time, open: p.price, high: p.price, low: p.price, close: p.price });
  }
  return [...rows.values()].sort((a, b) => a.time - b.time);
}

/** Keep reference and latest price tags separated, including when reference is below latest. */
export function referenceLabelY(referenceY, latestY, minY, maxY, gap = 28) {
  const clamp = (n) => Math.max(minY, Math.min(maxY, n));
  const natural = clamp(referenceY);
  if (Math.abs(natural - latestY) >= gap) return natural;
  const above = clamp(latestY - gap);
  const below = clamp(latestY + gap);
  return Math.abs(above - latestY) >= gap ? above : below;
}
