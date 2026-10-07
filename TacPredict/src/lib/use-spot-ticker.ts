import { useEffect, useRef, useState } from "react";
import type { PricePoint } from "@/lib/market-data.functions";
type Asset = "bitcoin" | "ethereum" | "solana";
const pairs: Record<string, Asset> = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
};
export function useSpotTicker() {
  const [ticks, setTicks] = useState<Partial<Record<Asset, PricePoint[]>>>({});
  const [live, setLive] = useState(false);
  const lastTick = useRef(0);
  useEffect(() => {
    let socket: WebSocket | undefined,
      retry: ReturnType<typeof setTimeout> | undefined,
      flush: ReturnType<typeof setTimeout> | undefined;
    let stopped = false,
      delay = 1000;
    const pending: Partial<Record<Asset, PricePoint[]>> = {};
    const connect = () => {
      if (stopped || document.hidden) return;
      socket = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      socket.onopen = () => {
        delay = 1000;
        socket?.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: Object.keys(pairs),
            channels: ["ticker"],
          }),
        );
      };
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type !== "ticker") return;
          const key = pairs[msg.product_id],
            price = Number(msg.price),
            time = Date.parse(msg.time);
          if (
            !key ||
            !Number.isFinite(price) ||
            price <= 0 ||
            !Number.isFinite(time) ||
            Math.abs(Date.now() - time) > 30000
          )
            return;
          lastTick.current = time;
          pending[key] = [...(pending[key] ?? []), { price, time }];
          if (!flush)
            flush = setTimeout(() => {
              flush = undefined;
              setLive(true);
              setTicks((old) => {
                const next = { ...old };
                for (const key of Object.values(pairs)) {
                  if (pending[key]?.length) {
                    next[key] = [...(old[key] ?? []), ...pending[key]!]
                      .filter((p) => p.time > Date.now() - 3600000)
                      .slice(-1200);
                    pending[key] = [];
                  }
                }
                return next;
              });
            }, 250);
        } catch {
          /* Ignore malformed source messages. */
        }
      };
      socket.onclose = () => {
        setLive(false);
        if (!stopped && !document.hidden) {
          retry = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30000);
        }
      };
      socket.onerror = () => socket?.close();
    };
    const visibility = () => {
      if (document.hidden) {
        clearTimeout(retry);
        socket?.close();
        setLive(false);
      } else connect();
    };
    connect();
    document.addEventListener("visibilitychange", visibility);
    const stale = setInterval(() => {
      if (Date.now() - lastTick.current > 30000) setLive(false);
    }, 10000);
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(flush);
      clearInterval(stale);
      socket?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return { ticks, live };
}
