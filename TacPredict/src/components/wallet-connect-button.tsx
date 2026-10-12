import { useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useWeb3Ready } from "@/components/providers/web3-ready";

function ConnectWalletSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <span className="inline-flex h-10 items-center justify-center rounded-full bg-primary/80 px-3.5 text-xs font-bold text-primary-foreground sm:px-4 sm:text-sm">
        Connect Wallet
      </span>
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
