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

function emptyLive(): LiveAsset {
  return { price: null, time: null, ticks: [], status: "connecting" };
}
/** Stable per-asset placeholders — never share one object across assets. */
const IDLE: Record<UpDownAsset, LiveAsset> = {
  bitcoin: Object.freeze(emptyLive()) as LiveAsset,
  ethereum: Object.freeze(emptyLive()) as LiveAsset,
  solana: Object.freeze(emptyLive()) as LiveAsset,
  bnb: Object.freeze(emptyLive()) as LiveAsset,
};
const KEEP_MS = 20 * 60_000;
const WS_URL = "wss://ws-feed.exchange.coinbase.com";
const productToAsset = new Map(ASSET_KEYS.map((a) => [ASSETS[a].product, a] as const));

const state: Record<UpDownAsset, LiveAsset> = {
  bitcoin: IDLE.bitcoin,
  ethereum: IDLE.ethereum,
  solana: IDLE.solana,
  bnb: IDLE.bnb,
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
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  )
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
      const time = msg.time ? Date.parse(msg.time) : NaN;
      if (
        !asset ||
        !Number.isFinite(price) ||
        !(price > 0) ||
        !Number.isFinite(time) ||
        time > Date.now() + 5000 ||
        Date.now() - time > 15000 ||
        (state[asset].time !== null && time < state[asset].time!)
      )
        return;
      onTick(asset, price, time);
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
    // Freshness is per asset, not merely any message on the socket.
    for (const a of ASSET_KEYS)
      if (
        state[a].status === "live" &&
        (state[a].time === null || Date.now() - state[a].time! > 15000)
      )
        state[a] = { ...state[a], status: "offline" };
    emit();
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
const noSubscription = () => () => {};
export function useLivePrice(asset: UpDownAsset, enabled = true) {
  const live = useSyncExternalStore(
    enabled ? subscribe : noSubscription,
    () => (enabled ? state[asset] : IDLE[asset]),
    () => IDLE[asset],
  );
  const polling = useQuery({
    ...spotTickersQueryOptions,
    enabled: enabled && live.status !== "live",
    refetchInterval: live.status !== "live" ? 5000 : false,
  });
  const candidate = live.status !== "live" ? (polling.data?.prices[asset] ?? null) : null;
  const fallback =
    candidate && candidate.time <= Date.now() + 5000 && Date.now() - candidate.time <= 15000
      ? candidate
      : null;
  return {
    price: fallback ? fallback.price : live.status === "live" ? live.price : null,
    time: fallback ? fallback.time : live.time,
    ticks: live.ticks,
    status: live.status,
    source: fallback || live.status === "live" ? "Coinbase" : null,
  };
}
