/** UTC-aligned schedule rows are not proof that a market or a bet exists. */
export function historyWindows(now, minutes, before = now, count = 8) {
  if (
    !Number.isFinite(now) ||
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    !Number.isFinite(before) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 12
  )
    throw Error("Invalid history window");
  const size = minutes * 60000;
  const last = Math.floor(Math.min(now, before) / size) * size;
  return Array.from({ length: count }, (_, i) => ({
    start: last - i * size,
    end: last + (1 - i) * size,
    minutes,
  }));
}
export function historyState(round, window, now) {
  if (!round) return "Not created";
  if (Number(round.state) === 2) return "Refunded";
  if (Number(round.state) === 1) return Number(round.result) === 1 ? "Up won" : "Down won";
  const exists = BigInt(round.up) + BigInt(round.down) > 0n || BigInt(round.startPrice) > 0n;
  if (!exists) return "Not created";
  return now < window.start ? "Bets open" : now < window.end ? "Running" : "Awaiting result";
}
