import type { Wallet, WalletDetailsParams } from "@rainbow-me/rainbowkit";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";

/** RainbowKit wallet entry so Farcaster appears in the connect modal (after Coinbase). */
export function farcasterWallet(): Wallet {
  return {
    id: "farcaster",
    name: "Farcaster",
    shortName: "Farcaster",
    iconUrl: "https://warpcast.com/~/icon/192.png",
    iconBackground: "#8A63D2",
    installed: true,
    createConnector: (_details: WalletDetailsParams) => farcasterMiniApp(),
  };
}
