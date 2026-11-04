import { useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useWeb3Ready } from "@/components/providers/web3-ready";

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
        className="inline-flex h-10 w-[148px] items-center justify-center rounded-full bg-white/20 animate-pulse"
      />
    </div>
  );
}

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

  if (!web3Ready || !Inner) {
    return className !== undefined ? (
      <ConnectWalletSkeleton className={className} />
    ) : (
      <ConnectWalletSkeleton />
    );
  }
  return className !== undefined ? <Inner className={className} /> : <Inner />;
}
