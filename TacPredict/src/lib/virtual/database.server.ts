import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { VirtualEvent } from "./types";
export const virtualDb = supabaseAdmin as unknown as SupabaseClient;
export async function checkpoint(deployment: string) {
  const r = await virtualDb
    .from("virtual_deployments")
    .select("checkpoint,checkpoint_hash,finalized_block,finalized_hash,start_block")
    .eq("id", deployment)
    .single();
  if (r.error || !r.data)
    throw Error("Virtual indexer is unavailable; migration/configuration required");
  return {
    number: BigInt(r.data.checkpoint),
    hash: r.data.checkpoint_hash as string | null,
    finalized: BigInt(r.data.finalized_block),
    finalizedHash: r.data.finalized_hash as string | null,
    start: BigInt(r.data.start_block),
  };
}
export async function walletEvents(deployment: string, wallet: string, through: bigint) {
  // Paginate, never silently truncate a wallet's financial history.
  const events: VirtualEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await virtualDb
      .from("virtual_chain_events")
      .select("event")
      .eq("deployment_id", deployment)
      .eq("wallet", wallet.toLowerCase())
      .eq("canonical", true)
      .lte("block_number", through.toString())
      .order("block_number")
      .order("log_index")
      .range(offset, offset + 499);
    if (r.error) throw Error("Virtual history projection unavailable");
    for (const row of r.data ?? []) events.push(row.event as VirtualEvent);
    if ((r.data?.length ?? 0) < 500) break;
    if (offset >= 100000)
      throw Error("History needs offline reconciliation; refusing truncated projection");
  }
  return events;
}
export async function ownsWallet(db: SupabaseClient, userId: string, wallet: string) {
  const registered = await db.rpc("register_my_protocol_wallet");
  if (registered.error) throw Error("Verify wallet ownership first");
  const r = await db
    .from("protocol_wallets")
    .select("address")
    .eq("user_id", userId)
    .eq("address", wallet.toLowerCase())
    .not("verified_at", "is", null)
    .maybeSingle();
  if (r.error || !r.data) throw Error("Verified wallet ownership required");
}

export async function marketEvents(deployment: string, marketId: string, through: bigint) {
  const events: VirtualEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await virtualDb
      .from("virtual_chain_events")
      .select("event")
      .eq("deployment_id", deployment)
      .eq("market_id", marketId)
      .eq("canonical", true)
      .lte("block_number", through.toString())
      .order("block_number")
      .order("log_index")
      .range(offset, offset + 499);
    if (r.error) throw Error("Virtual market statistics unavailable");
    for (const row of r.data ?? []) events.push(row.event as VirtualEvent);
    if ((r.data?.length ?? 0) < 500) break;
    if (offset >= 100000) throw Error("Market history needs offline reconciliation");
  }
  return events;
}
