import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { createConfig, http } from "wagmi";
import { PRIMARY_CHAIN, WALLETCONNECT_PROJECT_ID } from "./constants";

/**
 * Pure non-custodial wallets only.
 * No email / Gmail / Google / Apple / Twitter / embedded social login.
 */
const walletConnectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        rainbowWallet,
        rabbyWallet,
        trustWallet,
        injectedWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: "TacPredict",
    projectId: WALLETCONNECT_PROJECT_ID,
  },
);

export const wagmiConfig = createConfig({
  chains: [PRIMARY_CHAIN],
  // Farcaster Mini App / Frame injected wallet + RainbowKit EOA wallets
  connectors: [...walletConnectors, farcasterMiniApp()] as typeof walletConnectors,
  transports: {
    [PRIMARY_CHAIN.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
