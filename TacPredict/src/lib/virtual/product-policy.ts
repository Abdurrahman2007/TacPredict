/** Product policy, not a remotely toggleable production flag. Historical reads remain separate. */
export function rejectRealAssetTrading(): void {
  throw Error("Real-USDC execution is disabled. Use a verified Virtual USDC market.");
}
