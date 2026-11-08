/**
 * Database access for the on-chain trading tables (vset_*). Server only: the service role bypasses RLS, and these
 * tables have no policy for the browser at all. The generated Supabase types do not know these tables, so the client
 * is used untyped and every row type is declared here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VsetAsset } from "./schedule.mjs";

export type MarketRow = {
  key: string;
  asset: VsetAsset;
  minutes: number;
  start_at: string;
  end_at: string;
  open_at: string;
  market_id: number | null;
  create_tx: string | null;
  split_tx: string | null;
  inventory_ready: boolean;
  strike: number | null;
  end_price: number | null;
  outcome: number | null;
  voided: boolean;
  propose_tx: string | null;
  proposed_at: string | null;
  finalize_tx: string | null;
  resolved: boolean;
  redeem_sent_at: string | null;
  redeemed: boolean;
  failed: boolean;
  last_error: string | null;
};

export type FillRow = {
  tx_hash: string;
  log_index: number;
  market_id: number;
  market_key: string | null;
  account: string;
  side: "buy" | "sell";
  outcome: number;
  price_ppm: number;
  shares: number;
  usdc: number;
  block_number: number;
  created_at: string;
};

export async function vdb(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

export function dbError(action: string, error: { message?: string } | null | undefined): Error {
  return new Error(`${action}: ${error?.message ?? "database error"}`);
}

/** Single-writer lock: only one keeper run at a time may send transactions from the keeper wallet. */
export async function acquireKeeperLock(db: SupabaseClient, seconds: number): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + seconds * 1000);
  const { data, error } = await db
    .from("vset_keeper")
    .update({ locked_until: until.toISOString(), updated_at: now.toISOString() })
    .eq("id", 1)
    .lt("locked_until", now.toISOString())
    .select("id");
  if (error) throw dbError("keeper lock", error);
  return Array.isArray(data) && data.length === 1;
}

export async function releaseKeeperLock(db: SupabaseClient): Promise<void> {
  await db
    .from("vset_keeper")
    .update({ locked_until: new Date(0).toISOString(), updated_at: new Date().toISOString() })
    .eq("id", 1);
}

export async function readScanBlock(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db.from("vset_keeper").select("scan_block").eq("id", 1).maybeSingle();
  if (error) throw dbError("scan block", error);
  const value = (data as { scan_block?: number | null } | null)?.scan_block;
  return typeof value === "number" ? value : null;
}

export async function writeScanBlock(db: SupabaseClient, block: number): Promise<void> {
  const { error } = await db
    .from("vset_keeper")
    .update({ scan_block: block, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw dbError("scan block", error);
}

export async function patchMarket(
  db: SupabaseClient,
  key: string,
  patch: Partial<Omit<MarketRow, "key">>,
): Promise<void> {
  const { error } = await db
    .from("vset_markets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) throw dbError(`update ${key}`, error);
}

export async function marketByKey(db: SupabaseClient, key: string): Promise<MarketRow | null> {
  const { data, error } = await db.from("vset_markets").select("*").eq("key", key).maybeSingle();
  if (error) throw dbError("read market", error);
  return (data as MarketRow | null) ?? null;
}

/** Marks a page as being watched, so the keeper keeps its markets prepared. Throttled per server instance. */
const lastHot = new Map<string, number>();
export async function markHot(db: SupabaseClient, asset: string, minutes: number): Promise<void> {
  const id = `${asset}:${minutes}`;
  const now = Date.now();
  if (now - (lastHot.get(id) ?? 0) < 60_000) return;
  lastHot.set(id, now);
  const { error } = await db
    .from("vset_hot")
    .upsert({ asset, minutes, seen_at: new Date(now).toISOString() }, { onConflict: "asset,minutes" });
  if (error) lastHot.delete(id);
}
