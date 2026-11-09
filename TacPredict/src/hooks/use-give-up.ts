import { useEffect, useState } from "react";

/**
 * True once `waiting` has stayed true for `ms`; resets as soon as it turns false.
 * A wallet that never answers (or a chunk that never loads) must not leave a control stuck on a spinner forever.
 */
export function useGiveUp(waiting: boolean, ms: number): boolean {
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!waiting) {
      setGaveUp(false);
      return;
    }
    const timer = window.setTimeout(() => setGaveUp(true), ms);
    return () => window.clearTimeout(timer);
  }, [waiting, ms]);
  return waiting && gaveUp;
}
