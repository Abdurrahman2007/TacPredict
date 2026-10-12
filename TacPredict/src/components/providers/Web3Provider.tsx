import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { useEnsureBaseChain } from "@/hooks/use-ensure-base-chain";
import { useWalletSync } from "@/hooks/use-wallet-sync";
import { wagmiConfig } from "@/lib/web3/config";
import { PRIMARY_CHAIN } from "@/lib/web3/constants";
import { BaseWalletProvider } from "@/lib/onchain/wallet";
import { WagmiBaseBridge } from "./wagmi-base-bridge";

const tacDarkTheme = darkTheme({
  accentColor: "#5EEA9A",
  accentColorForeground: "#0B1A12",
  borderRadius: "medium",
  fontStack: "system",
  overlayBlur: "small",
});

function Web3Effects() {
  useWalletSync();
  useEnsureBaseChain();
  return <WagmiBaseBridge />;
}

type Web3ProviderProps = {
  children: ReactNode;
  queryClient: QueryClient;
};

/**
 * Wagmi + RainbowKit (wallets-only, Base Mainnet) wrapping BaseWalletProvider
 * so existing portfolio/trading hooks keep working.
 */
export function Web3Provider({ children, queryClient }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={tacDarkTheme}
          initialChain={PRIMARY_CHAIN}
          modalSize="compact"
          coolMode={false}
          appInfo={{ appName: "TacPredict" }}
        >
          <BaseWalletProvider>
            <Web3Effects />
            {children}
          </BaseWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
