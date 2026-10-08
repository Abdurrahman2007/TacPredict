import type { WalletProvider } from "./wallet";
let provider: WalletProvider | undefined;
export async function getCoinbaseAuthProvider(): Promise<WalletProvider> {
  if (provider) return provider;
  const sdk = import.meta.env.SSR ? null : await import("@coinbase/wallet-sdk");
  if (!sdk) throw new Error("Coinbase Wallet sign-in needs a browser.");
  const wallet = sdk.createCoinbaseWalletSDK({
    appName: "TacPredict",
    appLogoUrl: "https://tacpredict.fun/brand/tacpredict.svg",
    appChainIds: [8453],
    preference: { options: "eoaOnly" },
  });
  provider = wallet.getProvider() as WalletProvider;
  return provider;
}
