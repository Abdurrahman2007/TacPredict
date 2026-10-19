/**
 * Connected addresses are not ownership proof. The legacy users/wallets browser
 * telemetry path is intentionally disabled. Use the authenticated SIWE/ERC-1271
 * protocol wallet-link flow; only finalized-chain indexing supplies balances.
 */
export async function syncConnectedWallet(_input: {
  address: string;
  chainId: number;
}): Promise<{ ok: false; message: string }> {
  return {
    ok: false,
    message: "Unverified wallet telemetry is disabled. Verify wallet ownership to link an account.",
  };
}
