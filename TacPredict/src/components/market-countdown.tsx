import { useEffect, useState } from "react";
import type { Market } from "@/domain/markets/types";
export function MarketCountdown({
  market,
  snapshotTime,
}: {
  market: Market;
  snapshotTime: string;
}) {
  const [now, setNow] = useState(() => Date.parse(snapshotTime));
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = Date.parse(market.endsAt ?? ""),
    start = Date.parse(market.startsAt ?? "");
  if (!Number.isFinite(end) || !Number.isFinite(start))
    return <span className="text-xs text-muted-foreground">Source odds</span>;
  const upcoming = start > now,
    closed = end <= now;
  const seconds = Math.max(0, Math.floor(((upcoming ? start : end) - now) / 1000));
  const time =
    seconds >= 3600
      ? `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
      : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums ${closed || upcoming ? "text-muted-foreground" : "text-positive"}`}
    >
      <span
        className={`size-1.5 rounded-full ${closed || upcoming ? "bg-muted-foreground" : "bg-positive"}`}
      />
      {closed ? "ENDED" : upcoming ? `IN ${time}` : `LIVE ${time}`}
    </span>
  );
}
