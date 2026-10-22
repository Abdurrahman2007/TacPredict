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
