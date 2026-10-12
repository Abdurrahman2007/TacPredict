import { supabase } from "@/integrations/supabase/client";
import { PRIMARY_CHAIN_ID } from "./constants";

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Upsert connected wallet into Supabase `users` + `wallets`.
 * Existing → update last_active / last_seen.
 * New → insert with usdc_balance 0, total_trades 0 (DB defaults).
 * No client-side fake balances are written.
 */
export async function syncConnectedWallet(input: {
  address: string;
  chainId: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const address = normalizeAddress(input.address);
  const chainId = input.chainId || PRIMARY_CHAIN_ID;
  const now = new Date().toISOString();

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert(
      {
        wallet_address: address,
        chain_id: chainId,
        last_active: now,
        updated_at: now,
      },
      { onConflict: "wallet_address" },
    )
    .select("id")
    .single();

  if (userError || !user) {
    console.error("[web3] users upsert failed", userError);
    return { ok: false, message: userError?.message ?? "Failed to sync user" };
  }

  const { error: walletError } = await supabase.from("wallets").upsert(
    {
      address,
      user_id: user.id,
      chain_id: chainId,
      last_seen: now,
    },
    { onConflict: "address" },
  );

  if (walletError) {
    console.error("[web3] wallets upsert failed", walletError);
    return { ok: false, message: walletError.message };
  }

  return { ok: true };
}
