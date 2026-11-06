import { useRef } from "react";

/**
 * Keeps the last real value while a source briefly reloads (for example a query refetch or a
 * socket reconnect), so prices do not blink to "—". The value is dropped when `key` changes
 * (a new window), so a stale value is never carried into a different market.
 */
export function useSticky<T>(value: T | null | undefined, key: string | number): T | null {
  const ref = useRef<{ key: string | number; value: T | null }>({ key, value: null });
  if (ref.current.key !== key) ref.current = { key, value: null };
  if (value !== null && value !== undefined) ref.current.value = value;
  return ref.current.value;
}
