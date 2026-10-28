import { BRAND_WALLET_ICON_URL } from "@/lib/brand";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { PRIMARY_CHAIN, WALLETCONNECT_PROJECT_ID } from "./constants";
import { farcasterWallet } from "./farcaster-wallet";
import { preferredWallet } from "./preferred-wallet";

/**
 * Connect modal order:
 * 1) Wallet (Coinbase connector, short name "Wallet")
 * 2) Farcaster
 * 3) Other wallets (MetaMask, Rainbow, …)
 */
const walletConnectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [preferredWallet(), () => farcasterWallet()],
    },
    {
      groupName: "Other wallets",
      wallets: [
        metaMaskWallet,
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
    appIcon: BRAND_WALLET_ICON_URL,
    projectId: WALLETCONNECT_PROJECT_ID,
  },
);

export const wagmiConfig = createConfig({
  chains: [PRIMARY_CHAIN],
  connectors: walletConnectors,
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
