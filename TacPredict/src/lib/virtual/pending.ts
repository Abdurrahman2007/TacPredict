import type { Hex } from "viem";
import type { TradeIntent, VirtualDeployment } from "./types";

// Recovery hints only. Never a balance, receipt or proof of execution.
export type PendingVirtualTrade = { hash: Hex | null; intent: TradeIntent };
export type PendingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const pendingChanged = "tac:virtual-pending";
export function pendingKey(d: VirtualDeployment, wallet: string) {
  return `tac:virtual-pending:v1:${d.chainId}:${d.engine.toLowerCase()}:${d.id}:${wallet.toLowerCase()}`;
}
export function readPending(
  storage: PendingStorage,
  d: VirtualDeployment,
  wallet: string,
): PendingVirtualTrade | null {
  const raw = storage.getItem(pendingKey(d, wallet));
  if (raw === null) return null;
  // Corrupt records block submission; do not silently discard a potentially sent tx.
  if (raw.length > 2048) throw Error("Pending transaction recovery requires review");
  let p: PendingVirtualTrade;
  try {
    p = JSON.parse(raw);
    const i = p.intent;
    if (
      !i ||
      typeof i.wallet !== "string" ||
      !/^0x[0-9a-f]{40}$/i.test(i.wallet) ||
      i.wallet.toLowerCase() !== wallet.toLowerCase() ||
      (p.hash !== null && (typeof p.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(p.hash))) ||
      typeof i.isBuy !== "boolean" ||
      !Number.isInteger(i.outcome) ||
      i.outcome < 0 ||
      i.outcome > 2 ||
      ![i.marketId, i.input, i.nonce].every((v) => typeof v === "string" && /^\d{1,78}$/.test(v))
    )
      throw Error();
  } catch {
    throw Error("Pending transaction recovery requires review");
  }
  return p;
}
export function writePending(
  storage: PendingStorage,
  d: VirtualDeployment,
  p: PendingVirtualTrade,
) {
  const key = pendingKey(d, p.intent.wallet),
    value = JSON.stringify(p);
  storage.setItem(key, value);
  if (storage.getItem(key) !== value) throw Error("Durable transaction recovery unavailable");
}
export function clearPending(
  storage: PendingStorage,
  d: VirtualDeployment,
  wallet: string,
  hash: Hex,
  status: string,
) {
  if (!["confirmed", "finalized", "reverted"].includes(status)) return false;
  const p = readPending(storage, d, wallet);
  if (!p || p.hash?.toLowerCase() !== hash.toLowerCase()) return false;
  storage.removeItem(pendingKey(d, wallet));
  return true;
}
export function browserPending(d: VirtualDeployment, wallet: string) {
  if (typeof window === "undefined") return null;
  return readPending(window.localStorage, d, wallet);
}
export function notifyPending() {
  window.dispatchEvent(new Event(pendingChanged));
}
export function isExplicitWalletRejection(error: unknown): boolean {
  let e = error;
  for (let n = 0; n < 8 && e && typeof e === "object"; n++) {
    const v = e as { code?: unknown; cause?: unknown };
    if (v.code === 4001) return true;
    e = v.cause;
  }
  return false;
}
