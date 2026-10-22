import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildRanking, type RankingPeriod } from "./core.mjs";
const PAGE = 1000,
  MAX = 20000;
const db = () => supabaseAdmin as unknown as SupabaseClient;
type Query = {
  eq(column: string, value: unknown): Query;
  gte(column: string, value: unknown): Query;
  lte(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  order(column: string): Query;
  abortSignal(signal: AbortSignal): Query;
  range(from: number, to: number): PromiseLike<{ data: unknown; error: unknown }>;
};
async function pages<T>(
  table: string,
  columns: string,
  filters: (q: Query) => Query,
  order: string,
  schema: z.ZodType<T>,
) {
  const all: T[] = [];
  for (let start = 0; start < MAX; start += PAGE) {
    const { data, error } = await filters(
      db().from(table).select(columns).order(order) as unknown as Query,
    )
      .abortSignal(AbortSignal.timeout(15000))
      .range(start, start + PAGE - 1);
    if (error) throw Error("Finalized ranking records unavailable");
    const rows = z.array(schema).parse(data);
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
  throw Error("Ranking history exceeds safe processing limit");
}
type Snapshot = { expires: number; input: Parameters<typeof buildRanking>[0]; observedAt: string };
let cached: Snapshot | undefined;
let pending: Promise<Snapshot> | undefined;
async function snapshot(): Promise<Snapshot> {
  if (cached && cached.expires > Date.now()) return cached;
  if (pending) return pending;
  pending = (async () => {
    const d = await db()
      .from("protocol_deployments")
      .select("registry,factory,positions,exchange,oracle,settlement,deployment_block")
      .eq("chain_id", 8453)
      .eq("verified", true)
      .maybeSingle();
    if (d.error || !d.data) throw Error("Verified Base deployment unavailable");
    const c = await db()
      .from("protocol_indexer_checkpoints")
      .select("block_number,updated_at")
      .eq("chain_id", 8453)
      .maybeSingle();
    if (c.error || !c.data) throw Error("Finalized ranking checkpoint unavailable");
    const deployment = d.data,
      checkpoint = c.data;
    const addresses = Object.entries(deployment)
      .filter(([k]) => k !== "deployment_block")
      .map(([, v]) => String(v).toLowerCase());
    const events = await pages(
      "protocol_chain_events",
      "tx_hash,log_index,block_number,event_name,payload",
      (q) =>
        q
          .eq("chain_id", 8453)
          .gte("block_number", deployment.deployment_block)
          .lte("block_number", checkpoint.block_number)
          .in("contract_address", addresses)
          .order("log_index")
          .order("tx_hash"),
      "block_number",
      z.object({
        tx_hash: z.string().regex(/^0x[0-9a-f]{64}$/),
        log_index: z.number().int().nonnegative(),
        event_name: z.string(),
        payload: z.record(z.string(), z.unknown()),
      }),
    );
    const [markets, trades, resolutions] = await Promise.all([
      pages(
        "protocol_markets",
        "id,onchain_id,market_id,title",
        (q) => q.eq("chain_id", 8453).eq("published", true),
        "id",
        z.object({
          id: z.string().uuid(),
          onchain_id: z.union([z.string(), z.number().int().safe()]),
          market_id: z.string(),
          title: z.string(),
        }),
      ),
      pages(
        "protocol_trades",
        "tx_hash,log_index,timestamp",
        (q) => q.eq("chain_id", 8453),
        "id",
        z.object({
          tx_hash: z.string(),
          log_index: z.number(),
          timestamp: z.string().datetime({ offset: true }),
        }),
      ),
      pages(
        "protocol_resolutions",
        "market_uuid,finalized_at,status",
        (q) => q.in("status", ["FINAL", "VOID"]),
        "id",
        z.object({
          market_uuid: z.string().uuid(),
          finalized_at: z.string().datetime({ offset: true }).nullable(),
        }),
      ),
    ]);
    const tradeTimes = Object.fromEntries(
      trades.map((t) => [t.tx_hash + ":" + t.log_index, t.timestamp]),
    );
    const settledTimes = Object.fromEntries(
      resolutions.filter((r) => r.finalized_at).map((r) => [r.market_uuid, r.finalized_at!]),
    );
    const result: Snapshot = {
      expires: Date.now() + 60000,
      input: { events, markets, tradeTimes, settledTimes },
      observedAt: checkpoint.updated_at,
    };
    cached = result;
    return result;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
export async function readRanking(input: {
  period: RankingPeriod;
  page: number;
  trader?: string | undefined;
  wallet?: string | undefined;
}) {
  const snap = await snapshot(),
    rows = buildRanking({ ...snap.input, period: input.period });
  const { trader, wallet } = input;
  const find = (address: string | undefined) => {
    if (!address) return null;
    const current = rows.find((t) => t.wallet === address);
    if (current) return current;
    const historical = buildRanking({ ...snap.input, period: "all" }).find(
      (t) => t.wallet === address,
    );
    return historical
      ? {
          ...historical,
          rank: null,
          pnlAtomic: null,
          volumeAtomic: "0",
          markets: 0,
          settledMarkets: 0,
          activity: [],
        }
      : null;
  };
  const selected = find(trader),
    self = wallet === trader ? selected : find(wallet);
  return {
    status: "ready" as const,
    rows: rows
      .slice(input.page * 50, input.page * 50 + 50)
      .map(({ activity: _, positions: __, ...row }) => row),
    total: rows.length,
    selected,
    self,
    observedAt: snap.observedAt,
  };
}
