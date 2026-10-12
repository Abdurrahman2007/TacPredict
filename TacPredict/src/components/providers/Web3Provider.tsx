import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { useEnsureBaseChain } from "@/hooks/use-ensure-base-chain";
import { useWalletSync } from "@/hooks/use-wallet-sync";
import { wagmiConfig } from "@/lib/web3/config";
import { PRIMARY_CHAIN } from "@/lib/web3/constants";

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
  return null;
}

type Web3ProviderProps = {
  children: ReactNode;
  queryClient: QueryClient;
};

/**
 * Wagmi + React Query + RainbowKit (wallets-only, Base Mainnet, dark theme).
 * Config uses `ssr: true` for TanStack Start hydration safety.
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
          <Web3Effects />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
