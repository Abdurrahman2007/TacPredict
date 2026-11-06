import { useEffect, useState } from "react";

/** Wall clock that ticks every second. Starts from a server-provided time so hydration matches. */
export function useNow(initial: number, everyMs = 1000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Viewer's time zone, resolved after mount (UTC while rendering on the server). */
export function useTimeZone() {
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);
  return zone;
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();
/** Formatters are cached: creating Intl objects on every chart frame is expensive on phones. */
export function clock(ms: number, zone: string, seconds = false) {
  const key = `${zone}|${seconds ? 1 : 0}`;
  let f = clockFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(seconds ? { second: "2-digit" as const } : {}),
      hour12: true,
      timeZone: zone,
    });
    clockFormats.set(key, f);
  }
  return f.format(ms);
}

export function dayLabel(ms: number, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: zone,
  }).format(ms);
}
