import type { Wallet } from "@rainbow-me/rainbowkit";
import { coinbaseWallet } from "@rainbow-me/rainbowkit/wallets";

type WalletFactoryOptions = {
  appName: string;
  appIcon?: string;
  projectId: string;
};

/**
 * Coinbase connector labeled "Wallet" in the connect modal (short name too).
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
    };
  };
}
