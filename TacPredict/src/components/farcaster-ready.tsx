import { useEffect } from "react";

/**
 * Dismisses the Farcaster Mini App splash as soon as the client mounts.
 * Safe no-op outside Warpcast / Farcaster clients.
 */
export function FarcasterReady() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        if (cancelled) return;
        await sdk.actions.ready();
      } catch {
        /* browser / unsupported host */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
