import { useCallback, useSyncExternalStore } from "react";
import { creditPaperBalance } from "@/lib/paper/ledger";

const KEY = "tac-welcome-chest-v1";
const EVENT = "tac-welcome-chest";

export type WelcomeChest = {
  opened: boolean;
  amount: number | null;
  openedAt: string | null;
  wallet: string | null;
};

const EMPTY: WelcomeChest = Object.freeze({
  opened: false,
  amount: null,
  openedAt: null,
  wallet: null,
});

let snapshot: WelcomeChest = EMPTY;
let snapshotRaw: string | null = null;

function parse(raw: string | null): WelcomeChest {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as WelcomeChest;
    if (typeof parsed.opened !== "boolean") return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

function syncFromStorage(): WelcomeChest {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === snapshotRaw) return snapshot;
    snapshotRaw = raw;
    snapshot = parse(raw);
    return snapshot;
  } catch {
    snapshotRaw = null;
    snapshot = EMPTY;
    return EMPTY;
  }
}

function getSnapshot(): WelcomeChest {
  return syncFromStorage();
}

function getServerSnapshot(): WelcomeChest {
  return EMPTY;
}

function commit(next: WelcomeChest) {
  const raw = JSON.stringify(next);
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    /* private mode */
  }
  snapshotRaw = raw;
  snapshot = next;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onChange = () => {
    syncFromStorage();
    cb();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Random one-time Virtual USDC grant in $100–$500 (multiples of $10). */
export function rollWelcomeAmount() {
  const steps = Math.floor(Math.random() * 41); // 0..40 → 100..500
  return 100 + steps * 10;
}

export function useWelcomeChest() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const open = useCallback((wallet: string) => {
    const cur = syncFromStorage();
    if (cur.opened) return cur;
    const amount = rollWelcomeAmount();
    const next: WelcomeChest = {
      opened: true,
      amount,
      openedAt: new Date().toISOString(),
      wallet: wallet.toLowerCase(),
    };
    commit(next);
    creditPaperBalance(amount);
    return next;
  }, []);

  return {
    opened: state.opened,
    amount: state.amount,
    openedAt: state.openedAt,
    wallet: state.wallet,
    open,
  };
}

export function isPriorityWallet(connectorId: string | undefined | null) {
  if (!connectorId) return false;
  const id = connectorId.toLowerCase();
  return id.includes("coinbase") || id.includes("farcaster") || id.includes("baseaccount");
}
