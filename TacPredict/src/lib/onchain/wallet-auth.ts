import { supabase } from "@/integrations/supabase/client";
import type { WalletProvider } from "./wallet";

// Explicit sign-in only. The read-only Connect wallet flow never calls this.
export async function signInWithEthereumWallet(wallet: WalletProvider) {
  const siwe = import.meta.env.SSR ? null : await import("viem/siwe");
  if (!siwe) throw new Error("Wallet sign-in needs a browser.");
  const accounts = await wallet.request({ method: "eth_requestAccounts" });
  const chain = await wallet.request({ method: "eth_chainId" });
  if (
    !Array.isArray(accounts) ||
    typeof accounts[0] !== "string" ||
    !/^0x[0-9a-f]{40}$/i.test(accounts[0])
  )
    throw new Error("No wallet account was selected.");
  if (typeof chain !== "string" || !/^0x[0-9a-f]+$/i.test(chain))
    throw new Error("Could not read the wallet network.");
  const chainId = Number.parseInt(chain, 16);
  if (!Number.isSafeInteger(chainId) || chainId <= 0)
    throw new Error("Unsupported wallet network.");
  const address = accounts[0] as `0x${string}`;
  const now = Date.now();
  const message = siwe.createSiweMessage({
    address,
    chainId,
    domain: window.location.host,
    uri: `${window.location.origin}/auth`,
    version: "1",
    nonce: siwe.generateSiweNonce(),
    issuedAt: new Date(now),
    notBefore: new Date(now - 30_000),
    expirationTime: new Date(now + 600_000),
    statement:
      "Sign in to TacPredict. This signature does not authorize transactions or token transfers.",
  });
  const encoded = `0x${Array.from(new TextEncoder().encode(message), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const signature = await wallet.request({ method: "personal_sign", params: [encoded, address] });
  if (typeof signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(signature))
    throw new Error("The wallet did not return a supported sign-in signature.");
  const { error } = await supabase.auth.signInWithWeb3({
    chain: "ethereum",
    message,
    signature: signature as `0x${string}`,
  });
  if (error) throw error;
}
