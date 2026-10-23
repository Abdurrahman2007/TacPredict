import { useSyncExternalStore } from "react";
import { HIDE_STORAGE } from "./rules.mjs";
const event = "tac-overview-privacy";
function read() {
  try {
    return localStorage.getItem(HIDE_STORAGE) === "true";
  } catch {
    return false;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(event, callback);
    window.removeEventListener("storage", callback);
  };
}
export function useOverviewPrivacy(): [boolean, (value: boolean) => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  return [
    hidden,
    (value) => {
      try {
        localStorage.setItem(HIDE_STORAGE, String(value));
        window.dispatchEvent(new Event(event));
      } catch {
        /* unavailable storage: no financial action */
      }
    },
  ];
}
