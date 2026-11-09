/**
 * One SIWE attempt per wallet per browser tab session.
 * Survives brief wagmi disconnect flaps so the app never re-prompts verify
 * after the person already signed (or rejected) once this session.
 */
const KEY = "tac-siwe-attempted-v1";
const EVENT = "tac-siwe-attempt";

function read() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function write(set) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* private mode */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EVENT));
  }
}

export function hasSiweAttempt(address) {
  if (!address) return false;
  return read().has(address.toLowerCase());
}

export function markSiweAttempt(address) {
  if (!address) return;
  const set = read();
  set.add(address.toLowerCase());
  write(set);
}

/** Only for an explicit Log Out — never on wagmi reconnect flaps. */
export function clearSiweAttempt(address) {
  if (!address) return;
  const set = read();
  set.delete(address.toLowerCase());
  write(set);
}

export function subscribeSiweAttempts(cb) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
