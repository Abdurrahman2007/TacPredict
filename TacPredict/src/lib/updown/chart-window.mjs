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
