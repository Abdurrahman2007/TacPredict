/**
 * What does the person still have to do before a wallet-gated action can run?
 *
 * - "connect": no wallet is connected. Only then may the connect modal open.
 * - "verify":  a wallet is connected but there is no signed-in session yet. One signature is needed;
 *              the wallet is never asked to connect again.
 * - "ready":   connected and signed in.
 */
export function walletAccess({ address, signedIn }) {
  if (!address) return "connect";
  return signedIn ? "ready" : "verify";
}

export const ACCESS_LABEL = {
  connect: "Connect wallet",
  verify: "Verify wallet",
  ready: "",
};
