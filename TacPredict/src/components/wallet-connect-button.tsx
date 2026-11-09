import { useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useWeb3Ready } from "@/components/providers/web3-ready";
import { useGiveUp } from "@/hooks/use-give-up";

/**
 * Neutral loading state while the providers are still mounting / wagmi is
 * still restoring a stored connection. It must never read "Connect Wallet":
 * that text on first paint is exactly the repeat prompt users report, and
 * this pill is not clickable, so it cannot open the connect modal.
 */
function ConnectWalletSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)} aria-label="Wallet loading">
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-[148px] items-center justify-center rounded-full border border-white/20 bg-white/15 text-xs font-semibold text-white animate-pulse"
      >
        Connecting…
      </span>
    </div>
  );
}

/** If the wallet code has not loaded after this long (a failed download), the header offers a reload instead. */
const LOAD_GIVE_UP_MS = 5_000;

/**
 * Navbar wallet control. Keeps wagmi/rainbowkit out of the SSR graph by
 * dynamically importing the inner button only after Web3 providers are ready.
 */
export function WalletConnectButton({ className }: { className?: string }) {
  const web3Ready = useWeb3Ready();
  const [Inner, setInner] = useState<ComponentType<{ className?: string }> | null>(null);

  useEffect(() => {
    if (!web3Ready) return;
    let cancelled = false;
    void import("./wallet-connect-button.inner").then((mod) => {
      if (!cancelled) setInner(() => mod.WalletConnectButtonInner);
    });
    return () => {
      cancelled = true;
    };
  }, [web3Ready]);

  const stuck = useGiveUp(!web3Ready || !Inner, LOAD_GIVE_UP_MS);

  if (stuck) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={cn(
          "h-10 rounded-full border border-white/10 bg-white/10 px-5 text-xs font-semibold text-white",
          className,
        )}
      >
        Tap to reload
      </button>
    );
  }

  if (!web3Ready || !Inner) {
    return className !== undefined ? (
      <ConnectWalletSkeleton className={className} />
    ) : (
      <ConnectWalletSkeleton />
    );
  }
  return className !== undefined ? <Inner className={className} /> : <Inner />;
}
