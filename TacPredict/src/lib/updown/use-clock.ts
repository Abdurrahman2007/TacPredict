import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Wall clock that ticks every second. Starts from a server-provided time so hydration matches. */
export function useNow(initial: number, everyMs = 1000) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  // A stable server snapshot avoids streamed-query clock differences during hydration.
  const snapshot = useCallback(() => now, [now]);
  const subscribe = useCallback(() => () => {}, []);
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** Viewer's time zone, resolved after mount (UTC while rendering on the server). */
export function useTimeZone() {
  const [zone, setZone] = useState("UTC");
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);
  return zone;
}

export function clock(ms: number, zone: string, seconds = false) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" as const } : {}),
    hour12: true,
    timeZone: zone,
  }).format(ms);
}

export function dayLabel(ms: number, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: zone,
  }).format(ms);
}
