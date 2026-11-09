import { dismissWalletNotice, useWalletNotice } from "@/lib/wallet-notice";

/** Small message above the bottom navigation; tap to close. */
export function WalletNotice() {
  const notice = useWalletNotice();
  if (!notice) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-28 z-[70] mx-auto max-w-md">
      <button
        type="button"
        role="alert"
        onClick={dismissWalletNotice}
        className="pointer-events-auto w-full rounded-2xl border border-destructive/50 bg-card/95 px-4 py-3 text-left text-sm font-medium text-foreground shadow-lg backdrop-blur"
      >
        {notice.text}
        <span className="mt-1 block text-xs font-normal text-muted-foreground">Tap to close</span>
      </button>
    </div>
  );
}
