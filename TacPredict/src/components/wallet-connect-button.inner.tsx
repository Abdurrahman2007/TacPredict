import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Link } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { usePaperLedger } from "@/lib/paper/ledger";
import { useGiveUp } from "@/hooks/use-give-up";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { hasSiweAttempt, subscribeSiweAttempts } from "@/lib/onchain/siwe-attempt.mjs";
import { cn } from "@/lib/utils";

/** How long a stored connection may take to come back before the header offers Connect again. */
const RESTORE_GIVE_UP_MS = 18_000;

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatBalance(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Wagmi/RainbowKit-backed control — only mount inside Web3Provider. */
export function WalletConnectButtonInner({ className }: { className?: string }) {
  const ledger = usePaperLedger();
  const access = useWalletAccess();
  // Wagmi is the authority on connection state. RainbowKit's `account` can be
  // null while reconnecting, and authenticationStatus must NOT gate the pill:
  // this app uses its own SIWE, not RainbowKit auth, so requiring
  // "authenticated" made the control blank or look disconnected.
  const { address, isConnected, status: wagmiStatus } = useAccount();
  const wagmiWaiting = wagmiStatus === "reconnecting" || wagmiStatus === "connecting";
  const restoreGaveUp = useGiveUp(wagmiWaiting, RESTORE_GIVE_UP_MS);
  const wagmiRestoring = wagmiWaiting && !restoreGaveUp;
  const connected = Boolean(isConnected && address);
  const needsVerify = access.state === "verify";
  // Re-render when bridge marks a SIWE attempt so the header stops saying "Tap to verify".
  const attemptTick = useSyncExternalStore(
    subscribeSiweAttempts,
    () => `${address ?? ""}:${hasSiweAttempt(address)}`,
    () => "",
  );
  const alreadyTried = Boolean(address && hasSiweAttempt(address));
  void attemptTick;
  const showRetry = needsVerify && alreadyTried && Boolean(access.error);
  const showSigningIn = needsVerify && (access.busy || (alreadyTried && !access.error));

  return (
    <ConnectButton.Custom>
      {({ chain, openChainModal, openConnectModal, mounted }) => {
        // Always visible — never opacity:0 (that looked like an invisible Connect button).
        if (!mounted || wagmiRestoring) {
          return (
            <div className={cn("flex items-center gap-1.5 sm:gap-2", className)}>
              <span
                aria-label="Wallet loading"
                className="inline-flex h-10 w-[148px] items-center justify-center rounded-full border border-white/10 bg-white/10 text-xs font-semibold text-white/70 animate-pulse"
              >
                Connecting…
              </span>
            </div>
          );
        }

        if (!connected) {
          return (
            <div className={cn("flex items-center gap-1.5 sm:gap-2", className)}>
              <button
                type="button"
                onClick={openConnectModal}
                className="h-10 rounded-full bg-white px-6 text-sm font-semibold text-[#10171c] shadow-sm hover:bg-white/90"
              >
                Connect Wallet
              </button>
            </div>
          );
        }

        if (chain?.unsupported) {
          return (
            <div className={cn("flex items-center gap-1.5 sm:gap-2", className)}>
              <button
                type="button"
                onClick={openChainModal}
                className="inline-flex h-10 items-center rounded-full border border-destructive/50 bg-destructive/15 px-3 text-xs font-bold text-destructive sm:text-sm"
              >
                Switch to Base
              </button>
            </div>
          );
        }

        const balanceLabel = `${formatBalance(ledger.balance)} Virtual USDC`;
        const statusLabel = showRetry
          ? "Tap to retry"
          : showSigningIn
            ? access.busy
              ? "Waiting…"
              : "Signing in…"
            : needsVerify && !alreadyTried
              ? "Tap to verify"
              : balanceLabel;

        return (
          <div className={cn("flex items-center gap-1.5 sm:gap-2", className)}>
            <button
              type="button"
              onClick={openChainModal}
              className="hidden h-10 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-foreground sm:inline-flex"
              title="Base Mainnet"
            >
              {chain?.hasIcon && chain.iconUrl ? (
                <img
                  alt={chain.name ?? "Base"}
                  src={chain.iconUrl}
                  className="size-4 rounded-full"
                  style={{ background: chain.iconBackground }}
                />
              ) : (
                <span className="size-2 rounded-full bg-primary" />
              )}
              <span>Base</span>
            </button>

            {showRetry || (needsVerify && !alreadyTried) ? (
              <button
                type="button"
                onClick={() => void access.run()}
                disabled={access.busy}
                className="app-account-button inline-flex h-10 max-w-[168px] shrink-0 items-center gap-2 rounded-full border border-white/10 bg-card px-3 text-left text-foreground shadow-sm hover:bg-secondary sm:max-w-[180px]"
                aria-label={`Wallet ${address}, ${statusLabel}`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {address!.slice(2, 3).toUpperCase()}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-xs font-semibold tabular-nums">
                    <span className="hidden sm:inline">{statusLabel}</span>
                    <span className="sm:hidden">{showRetry ? "Retry" : "Verify"}</span>
                  </span>
                  <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">
                    {shortenAddress(address!)}
                  </span>
                </span>
              </button>
            ) : (
              <Link
                to="/profile"
                className="app-account-button inline-flex h-10 max-w-[168px] shrink-0 items-center gap-2 rounded-full border border-white/10 bg-card px-3 text-left text-foreground shadow-sm hover:bg-secondary sm:max-w-[180px]"
                aria-label={`Wallet ${address}, open portfolio. Disconnect from the menu.`}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {address!.slice(2, 3).toUpperCase()}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate text-xs font-semibold tabular-nums">
                    {showSigningIn ? statusLabel : balanceLabel}
                  </span>
                  <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">
                    {shortenAddress(address!)}
                  </span>
                </span>
              </Link>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
