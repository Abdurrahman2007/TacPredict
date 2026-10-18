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
