import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aggregateExecutions } from "./admin-dashboard.mjs";
import { poolConfig } from "@/lib/pool/pool.server";
const db = () => supabaseAdmin as unknown as SupabaseClient;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const balanceAbi = parseAbi(["function balanceOf(address) view returns(uint256)"]);
const pub = () =>
  createPublicClient({
    chain: base,
    transport: http(process.env["BASE_PROTOCOL_RPC_URL"] || "https://mainnet.base.org", {
      timeout: 8000,
      retryCount: 0,
    }),
  });
const signal = () => AbortSignal.timeout(15000);
const CLOSED = ["CLOSED", "RESOLVING", "RESOLVED", "SETTLED", "VOID", "CANCELLED"];
export async function loadMarketCards(
  page: number,
  filter: "all" | "open" | "closed",
  search: string,
) {
  const needle = search.replace(/[%_\\]/g, "").trim();
  let q = db()
    .from("protocol_markets")
    .select("id,market_id,title,category,subcategory,status,close_at,metadata_hash", {
      count: "exact",
    })
    .eq("chain_id", 8453);
  if (filter === "open") q = q.eq("status", "OPEN");
  if (filter === "closed") q = q.in("status", CLOSED);
  if (needle) q = q.ilike("title", `%${needle}%`);
  const result = await q
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * 12, page * 12 + 11)
    .abortSignal(signal());
  if (result.error || result.count === null) throw Error("Markets unavailable");
  const rows = await Promise.all(
    (result.data ?? []).map(async (m) => {
      const trades = [];
      let complete = false;
      for (let offset = 0; offset < 5000; offset += 1000) {
        const r = await db()
          .from("protocol_trades")
          .select("id,buyer,seller,usdc_atomic")
          .eq("chain_id", 8453)
          .eq("market_uuid", m.id)
          .order("id")
          .range(offset, offset + 999)
          .abortSignal(signal());
        if (r.error || !r.data) break;
        trades.push(...r.data);
        if (r.data.length < 1000) {
          complete = true;
          break;
        }
      }
      let metrics: null | ReturnType<typeof aggregateExecutions> = null;
      try {
        if (complete) metrics = aggregateExecutions(trades);
      } catch {
        /* fail closed on unsafe database numerics */
      }
      return {
        ...m,
        volumeAtomic: metrics?.volumeAtomic ?? null,
        participants: metrics?.participants ?? null,
      };
    }),
  );
  return {
    rows,
    total: result.count,
    page,
    observedAt: new Date().toISOString(),
    scope: "Indexed Base Exchange",
  };
}
export async function loadMarketCounts() {
  async function count(statuses?: string[]) {
    let q = db()
      .from("protocol_markets")
      .select("id", { count: "exact", head: true })
      .eq("chain_id", 8453);
    if (statuses) q = q.in("status", statuses);
    const r = await q.abortSignal(signal());
    return r.error ? null : r.count;
  }
  const [total, open, closed, active] = await Promise.all([
    count(),
    count(["OPEN"]),
    count(CLOSED),
    count(["OPEN", "UPCOMING"]),
  ]);
  return { total, open, closed, active };
}
export async function loadTreasuryBalance() {
  const c = await poolConfig();
  if (!c.address || !/^0x[0-9a-f]{40}$/i.test(c.treasury))
    return { address: null, balanceAtomic: null, observedAt: null };
  const p = pub(),
    block = await p.getBlock({ blockTag: "finalized" });
  const n = await p.readContract({
    address: USDC,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [c.treasury as Address],
    blockNumber: block.number,
  });
  return {
    address: c.treasury,
    balanceAtomic: n.toString(),
    observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
  };
}
/** Only verified wallets of the selected account, never client-supplied wallet addresses. */
export async function loadUserDetails(userId: string) {
  const wr = await db()
    .from("protocol_wallets")
    .select("id,address")
    .eq("user_id", userId)
    .not("verified_at", "is", null)
    .order("id")
    .limit(21)
    .abortSignal(signal());
  if (wr.error || !wr.data || wr.data.length > 20) throw Error("Wallet details unavailable");
  const p = pub();
  const block = wr.data.length ? await p.getBlock({ blockTag: "finalized" }) : null;
  const wallets = await Promise.all(
    wr.data.map(async (w) => {
      const [balance, executions] = await Promise.allSettled([
        p.readContract({
          address: USDC,
          abi: balanceAbi,
          functionName: "balanceOf",
          args: [w.address as Address],
          blockNumber: block!.number,
        }),
        db()
          .from("protocol_trades")
          .select("id", { count: "exact", head: true })
          .eq("chain_id", 8453)
          .or(`buyer.eq.${w.address},seller.eq.${w.address}`)
          .abortSignal(signal()),
      ]);
      return {
        address: w.address,
        balanceAtomic: balance.status === "fulfilled" ? balance.value.toString() : null,
        executions:
          executions.status === "fulfilled" && !executions.value.error
            ? executions.value.count
            : null,
      };
    }),
  );
  return {
    wallets,
    observedAt: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
    scope: "Base USDC · indexed Exchange executions",
  };
}
