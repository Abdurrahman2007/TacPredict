import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { ASSETS, ASSET_KEYS, type PricePoint, type UpDownAsset } from "./window.mjs";
import { spotTickersQueryOptions } from "./spot.functions";

/**
 * One shared Coinbase ticker socket for the whole page. It opens when the first component needs a
 * price and closes shortly after the last one leaves. If the socket cannot connect, components
 * fall back to polling the server price endpoint; they never invent a price.
 */
export type LiveStatus = "connecting" | "live" | "offline";
export type LiveAsset = {
  price: number | null;
  time: number | null;
  ticks: PricePoint[];
  status: LiveStatus;
};

const EMPTY: LiveAsset = { price: null, time: null, ticks: [], status: "connecting" };
const KEEP_MS = 20 * 60_000;
const WS_URL = "wss://ws-feed.exchange.coinbase.com";
const productToAsset = new Map(ASSET_KEYS.map((a) => [ASSETS[a].product, a] as const));

const state: Record<UpDownAsset, LiveAsset> = {
  bitcoin: EMPTY,
  ethereum: EMPTY,
  solana: EMPTY,
};
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let subscribers = 0;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let watchdog: ReturnType<typeof setInterval> | undefined;
let lastMessage = 0;

const emit = () => listeners.forEach((listener) => listener());

function setAllStatus(status: LiveStatus) {
  for (const asset of ASSET_KEYS) state[asset] = { ...state[asset], status };
  emit();
}

function onTick(asset: UpDownAsset, price: number, time: number) {
  const prev = state[asset];
  const last = prev.ticks[prev.ticks.length - 1];
  const kept = prev.ticks.filter((t) => t.time >= time - KEEP_MS);
  // At most one stored point per second keeps the chart light.
  const ticks =
    last && time - last.time < 1000
      ? [...kept.slice(0, -1), { time, price }]
      : [...kept, { time, price }];
  state[asset] = { price, time, ticks, status: "live" };
}

function connect() {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))
    return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    setAllStatus("offline");
    return;
  }
  socket = ws;
  ws.onopen = () => {
    attempt = 0;
    lastMessage = Date.now();
    ws.send(
      JSON.stringify({
        type: "subscribe",
        product_ids: ASSET_KEYS.map((a) => ASSETS[a].product),
        channels: ["ticker"],
      }),
    );
  };
  ws.onmessage = (event) => {
    lastMessage = Date.now();
    try {
      const msg = JSON.parse(String(event.data)) as {
        type?: string;
        product_id?: string;
        price?: string;
        time?: string;
      };
      if (msg.type !== "ticker" || !msg.product_id || !msg.price) return;
      const asset = productToAsset.get(msg.product_id);
      const price = Number(msg.price);
      const time = msg.time ? Date.parse(msg.time) : Date.now();
      if (!asset || !(price > 0)) return;
      onTick(asset, price, Number.isFinite(time) ? time : Date.now());
      emit();
    } catch {
      /* ignore malformed frames */
    }
  };
  const lost = () => {
    if (socket === ws) socket = null;
    setAllStatus("offline");
    if (subscribers > 0) {
      attempt += 1;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, Math.min(15_000, 1000 * 2 ** Math.min(attempt, 4)));
    }
  };
  ws.onclose = lost;
  ws.onerror = () => ws.close();
}

function startWatchdog() {
  clearInterval(watchdog);
  watchdog = setInterval(() => {
    // The ticker sends several messages per second; silence means a dead connection.
    if (socket && socket.readyState === WebSocket.OPEN && Date.now() - lastMessage > 12_000)
      socket.close();
  }, 4000);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscribers += 1;
  clearTimeout(closeTimer);
  connect();
  startWatchdog();
  return () => {
    listeners.delete(listener);
    subscribers -= 1;
    if (subscribers === 0) {
      closeTimer = setTimeout(() => {
        clearTimeout(reconnectTimer);
        clearInterval(watchdog);
        socket?.close();
        socket = null;
      }, 3000);
    }
  };
}

/** Live price for one asset: socket ticks when connected, polled price otherwise. */
export function useLivePrice(asset: UpDownAsset) {
  const live = useSyncExternalStore(
    subscribe,
    () => state[asset],
    () => EMPTY,
  );
  const polling = useQuery({
    ...spotTickersQueryOptions,
    enabled: live.status !== "live",
    refetchInterval: live.status !== "live" ? 5000 : false,
  });
  const fallback = live.status !== "live" ? (polling.data?.prices[asset] ?? null) : null;
  return {
    price: fallback ? fallback.price : live.price,
    time: fallback ? fallback.time : live.time,
    ticks: live.ticks,
    status: live.status,
    source: fallback || live.price !== null ? "Coinbase" : null,
  };
}
