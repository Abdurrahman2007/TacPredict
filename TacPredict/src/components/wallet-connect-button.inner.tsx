import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { useVirtualAccount, virtualMoney } from "@/lib/virtual/hooks";
import { cn } from "@/lib/utils";

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Wagmi/RainbowKit-backed control — only mount inside Web3Provider. */
export function WalletConnectButtonInner({ className }: { className?: string }) {
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const virtual = useVirtualAccount(feed.data?.virtualDeployment);
  const balance = virtualMoney(virtual.data?.balance);

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
        authenticationStatus,
      }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            className={cn("flex items-center gap-1.5 sm:gap-2", className)}
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none" as const,
                userSelect: "none" as const,
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="h-10 rounded-full bg-white px-6 text-sm font-semibold text-[#10171c] shadow-sm hover:bg-white/90"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="inline-flex h-10 items-center rounded-full border border-destructive/50 bg-destructive/15 px-3 text-xs font-bold text-destructive sm:text-sm"
                  >
                    Switch to Base
                  </button>
                );
              }

              return (
                <>
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="hidden h-10 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-foreground sm:inline-flex"
                    title="Base Mainnet"
                  >
                    {chain.hasIcon && chain.iconUrl ? (
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

                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="app-account-button inline-flex h-11 max-w-[180px] items-center gap-2 rounded-full border border-white/10 bg-card px-3 text-left text-foreground shadow-sm hover:bg-secondary"
                    aria-label={`Wallet ${account.address}, ${balance} Virtual USDC`}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {account.address.slice(2, 3).toUpperCase()}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-xs font-semibold tabular-nums">
                        {balance} Virtual USDC
                      </span>
                      <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">
                        {shortenAddress(account.address)}
                      </span>
                    </span>
                  </button>
                </>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
