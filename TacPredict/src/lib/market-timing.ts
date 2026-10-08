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

export function marketLocalWindowLabel(market: Market, timeZone = "UTC") {
  const start = new Date(market.startsAt ?? ""),
    end = new Date(market.endsAt ?? "");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start)
    return null;
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone });
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  const a = time.format(start).replace(/\s/g, " "),
    b = time.format(end).replace(/\s/g, " ");
  const samePeriod = a.slice(-2) === b.slice(-2);
  const shortStart =
    samePeriod && date.format(start) === date.format(end) ? a.replace(/\s[AP]M$/, "") : a;
  const zone =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(start)
      .find((p) => p.type === "timeZoneName")?.value ?? "UTC";
  return `${date.format(start)}, ${shortStart}–${date.format(start) === date.format(end) ? "" : date.format(end) + ", "}${b} ${timeZone === "UTC" || /^GMT(?:[+-]0(?::00)?)?$/.test(zone) ? "UTC" : zone}`;
}
