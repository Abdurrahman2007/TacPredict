import type { Market } from "@/domain/markets/types";
export function durationMinutes(market: Market) {
  const start = Date.parse(market.startsAt ?? ""),
    end = Date.parse(market.endsAt ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const minutes = (end - start) / 60000;
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 1440 ? minutes : null;
}
export function marketDurationLabel(market: Market) {
  const n = durationMinutes(market);
  return n === null
    ? null
    : n >= 60 && n % 60 === 0
      ? `${n / 60} hour${n === 60 ? "" : "s"}`
      : `${n} min`;
}
export function marketWindowLabel(market: Market) {
  if (!market.startsAt || !market.endsAt) return null;
  const start = new Date(market.startsAt),
    end = new Date(market.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(start);
  return `${date} · ${start.toISOString().slice(11, 16)}–${end.toISOString().slice(11, 16)} UTC`;
}

export function marketDurationText(market: Market) {
  const n = durationMinutes(market);
  if (n === null) return null;
  return n >= 60 && n % 60 === 0
    ? `${n / 60} hour${n === 60 ? "" : "s"}`
    : `${n} minute${n === 1 ? "" : "s"}`;
}
