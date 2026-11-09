import { supabase } from "@/integrations/supabase/client";
import type { WalletProvider } from "./wallet";
import { signInSmartWallet } from "./smart-wallet-auth";
import { isPlainSignature, isSignatureShape, signInReasonText } from "./smart-wallet-policy.mjs";

// Explicit sign-in only. The read-only Connect wallet flow never calls this.
export async function signInWithEthereumWallet(
  wallet: WalletProvider,
  knownAddress?: string | null,
) {
  const siwe = import.meta.env.SSR ? null : await import("viem/siwe");
  if (!siwe) throw new Error("Wallet sign-in needs a browser.");
  const existing = await wallet.request({ method: "eth_accounts" });
  // A wallet that wagmi already connected is never asked to connect again just to sign in.
  const accounts =
    Array.isArray(existing) && existing.length
      ? existing
      : knownAddress && /^0x[0-9a-f]{40}$/i.test(knownAddress)
        ? [knownAddress]
        : await wallet.request({ method: "eth_requestAccounts" });
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
  if (!isSignatureShape(signature))
    throw new Error("The wallet did not return a sign-in signature.");
  if (isPlainSignature(signature)) {
    // A single-key wallet: Supabase checks the signature itself.
    const { error } = await supabase.auth.signInWithWeb3({
      chain: "ethereum",
      message,
      signature: signature as `0x${string}`,
    });
    if (error) throw error;
    return;
  }
  // A smart-contract wallet (Base Account and similar): its longer proof is judged by the wallet's contract on Base,
  // which only the server can ask. The server hands back a one-time token that becomes a normal session here.
  const result = await signInSmartWallet({ data: { message, signature } });
  if (!result.ok) throw new Error(signInReasonText(result.reason));
  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: result.tokenHash,
  });
  if (error) throw error;
}
