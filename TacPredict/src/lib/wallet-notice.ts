import { useSyncExternalStore } from "react";

/**
 * One short wallet message shown on every page (a failed verification, a wallet that did not answer), so a failure
 * is never silent. Closes by itself, or when tapped.
 */
export type WalletNotice = { id: number; text: string };

const SHOW_MS = 20_000;
let current: WalletNotice | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function dismissWalletNotice() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (current === null) return;
  current = null;
  emit();
}

export function showWalletNotice(text: string) {
  const clean = text.trim().slice(0, 240);
  if (!clean) return;
  if (timer) clearTimeout(timer);
  current = { id: nextId++, text: clean };
  timer = setTimeout(dismissWalletNotice, SHOW_MS);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWalletNotice(): WalletNotice | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
