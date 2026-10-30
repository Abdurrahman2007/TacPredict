import type { Wallet } from "@rainbow-me/rainbowkit";
import { coinbaseWallet } from "@rainbow-me/rainbowkit/wallets";
import { COINBASE_WALLET_ICON_BACKGROUND, COINBASE_WALLET_ICON_URL } from "@/lib/brand";

type WalletFactoryOptions = {
  appName: string;
  appIcon?: string;
  projectId: string;
};

/**
 * Coinbase connector labeled "Wallet" in the connect modal (short name too).
 * The icon is always the official Coinbase Wallet mark shipped with the app, never the logo that
 * the wallet library bundles, so the modal cannot show the Coinbase exchange logo.
 */
export function preferredWallet(): (options: WalletFactoryOptions) => Wallet {
  return (options) => {
    const base = coinbaseWallet(
      options.appIcon
        ? { appName: options.appName || "TacPredict", appIcon: options.appIcon }
        : { appName: options.appName || "TacPredict" },
    );
    return {
      ...base,
      name: "Wallet",
      shortName: "Wallet",
      iconUrl: COINBASE_WALLET_ICON_URL,
      iconBackground: COINBASE_WALLET_ICON_BACKGROUND,
      iconAccent: COINBASE_WALLET_ICON_BACKGROUND,
    };
  };
}
