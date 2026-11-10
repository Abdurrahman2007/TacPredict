/**
 * The keeper: the one place that sends transactions from the market-maker wallet.
 *
 * Every run (cron once a minute, plus a nudge while people are on the page) does a bounded amount of work:
 *   1. keep the maker wallet's approvals in place and withdraw returned resolver bonds,
 *   2. prepare markets for the pages people are watching (create ahead, stock with shares once open),
 *   3. resolve finished markets (propose the result, wait out the 60 second challenge, finalize),
 *   4. pay out winners automatically (redeemFor is safe: funds only ever go to the holder),
 *   5. index fills from the Exchange contract.
 * A database lock makes sure two runs never share the wallet's nonce. Nothing is created or spent for pages nobody
 * is looking at, and markets nobody traded in are never resolved on chain.
 */
import { encodeFunctionData, parseEventLogs, type Address, type Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  virtualConditionalPositionsAbi,
  virtualMarketFactoryAbi,
  virtualResolutionOracleAbi,
  virtualUsdcAbi,
} from "./abi";
import {
  acquireKeeperLock,
  dbError,
  patchMarket,
  readScanBlock,
  releaseKeeperLock,
  vdb,
  writeScanBlock,
  type MarketRow,
} from "./db.server";
import { fillRowsFromLogs, tradeExecutedEvent } from "./fills.server";
import { evidenceHashFor, marketTerms, sourceHashFor } from "./market-terms.mjs";
import {
  INVENTORY_LOW_WATER,
  INVENTORY_PER_SIDE,
  KEEPER_ADDRESS,
  MAKER_ALLOWANCE,
  VSET_CONTRACTS,
  keeperAccount,
  publicClient,
  tokenIdOf,
  walletClientFor,
  type VsetPublicClient,
} from "./onchain.server";
import {
  OPEN_LEAD_SEC,
  PRE_OPEN_SEC,
  PROPOSE_DELAY_SEC,
  RESOLUTION_WINDOW_SEC,
  plannedWindows,
  windowOutcome,
  type PlannedWindow,
  type VsetAsset,
} from "./schedule.mjs";

const HOT_MINUTES = 20;
const TX_BUDGET = 12;
const LOCK_SECONDS = 45;
const CHALLENGE_WAIT_SEC = 62;
/** Base txs are cheap; keep working until the wallet is nearly empty instead of idling just under 0.00002. */
const MIN_KEEPER_ETH = 5_000_000_000_000n; // 0.000005 ETH
const BOND_WITHDRAW_AT = 50_000_000n;
const LOW_FLOAT = 5_000_000_000n;

const GAS = {
  create: 800_000n,
  split: 350_000n,
  propose: 350_000n,
  finalize: 300_000n,
  redeem: 250_000n,
  approve: 90_000n,
  withdraw: 120_000n,
} as const;

export type TickReport = {
  ok: boolean;
  skipped?: string;
  actions: string[];
  notes: string[];
  errors: string[];
  ms: number;
};

type Receipt = Awaited<ReturnType<VsetPublicClient["getTransactionReceipt"]>>;

type Ctx = {
  db: SupabaseClient;
  pub: VsetPublicClient;
  wallet: ReturnType<typeof walletClientFor>;
  nonce: number;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  sent: number;
  report: TickReport;
  hot: Set<string>;
};

class BudgetReached extends Error {}

const iso = (sec: number) => new Date(sec * 1000).toISOString();
const secOf = (value: string) => Date.parse(value) / 1000;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);
const hotKey = (asset: string, minutes: number) => `${asset}:${minutes}`;

async function send(ctx: Ctx, to: Address, data: Hex, gas: bigint, label: string): Promise<Hex> {
  if (ctx.sent >= TX_BUDGET) throw new BudgetReached();
  const hash = await ctx.wallet.sendTransaction({
    to,
    data,
    gas,
    nonce: ctx.nonce,
    maxFeePerGas: ctx.maxFeePerGas,
    maxPriorityFeePerGas: ctx.maxPriorityFeePerGas,
    type: "eip1559",
  });
  ctx.nonce += 1;
  ctx.sent += 1;
  ctx.report.actions.push(`${label} ${hash}`);
  return hash;
}

async function receiptOf(pub: VsetPublicClient, hash: string): Promise<Receipt | null> {
  try {
    return await pub.getTransactionReceipt({ hash: hash as Hex });
  } catch {
    return null;
  }
}

/** "propose reverted #2" -> 2; used to retry a failed step a few times, never forever. */
function retryCount(note: string | null, label: string): number {
  const match = note ? new RegExp(`${label} reverted #(\\d+)`).exec(note) : null;
  return match ? Number(match[1]) : 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Step 0: confirmations of transactions sent by earlier runs.

async function settleReceipts(ctx: Ctx, rows: MarketRow[]): Promise<void> {
  type Pending = { row: MarketRow; kind: "create" | "split" | "propose" | "finalize"; hash: string };
  const pending: Pending[] = [];
  for (const row of rows) {
    if (row.create_tx && row.market_id === null) pending.push({ row, kind: "create", hash: row.create_tx });
    if (row.split_tx && !row.inventory_ready) pending.push({ row, kind: "split", hash: row.split_tx });
    if (row.propose_tx && !row.proposed_at) pending.push({ row, kind: "propose", hash: row.propose_tx });
    if (row.finalize_tx && !row.resolved) pending.push({ row, kind: "finalize", hash: row.finalize_tx });
  }
  if (!pending.length) return;
  const receipts = await Promise.all(pending.map((item) => receiptOf(ctx.pub, item.hash)));
  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i];
    const receipt = receipts[i];
    if (!item || !receipt) continue;
    const { row, kind } = item;
    if (receipt.status === "success") {
      if (kind === "create") {
        const meta = parseEventLogs({
          abi: virtualMarketFactoryAbi,
          eventName: "MetadataPublished",
          logs: receipt.logs,
        });
        const created = parseEventLogs({
          abi: virtualMarketFactoryAbi,
          eventName: "MarketCreated",
          logs: receipt.logs,
        });
        const id = meta[0]?.args.marketId ?? created[0]?.args.marketId;
        if (id === undefined) {
          row.failed = true;
          await patchMarket(ctx.db, row.key, { failed: true, last_error: "create: no market id in receipt" });
        } else {
          row.market_id = Number(id);
          await patchMarket(ctx.db, row.key, { market_id: row.market_id });
        }
      } else if (kind === "split") {
        row.inventory_ready = true;
        await patchMarket(ctx.db, row.key, { inventory_ready: true });
      } else if (kind === "propose") {
        row.proposed_at = iso(Math.floor(Date.now() / 1000));
        await patchMarket(ctx.db, row.key, { proposed_at: row.proposed_at });
      } else {
        row.resolved = true;
        await patchMarket(ctx.db, row.key, { resolved: true });
      }
      continue;
    }
    // Reverted. Retry create/split a few times (gas / RPC blips); resolution already retries.
    if (kind === "create" || kind === "split") {
      const tries = retryCount(row.last_error, kind) + 1;
      const note = `${kind} reverted #${tries}`;
      if (kind === "create") row.create_tx = null;
      else row.split_tx = null;
      row.last_error = note;
      const giveUp = tries >= 3;
      if (giveUp) row.failed = true;
      await patchMarket(
        ctx.db,
        row.key,
        kind === "create"
          ? { create_tx: null, last_error: note, failed: giveUp }
          : { split_tx: null, last_error: note, failed: giveUp, inventory_ready: false },
      );
    } else {
      const tries = retryCount(row.last_error, kind) + 1;
      const note = `${kind} reverted #${tries}`;
      if (kind === "propose") row.propose_tx = null;
      else row.finalize_tx = null;
      row.last_error = note;
      await patchMarket(
        ctx.db,
        row.key,
        kind === "propose"
          ? { propose_tx: null, last_error: note, failed: tries >= 3 }
          : { finalize_tx: null, last_error: note, failed: tries >= 3 },
      );
      if (tries >= 3) row.failed = true;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Step 1: maker approvals and bond credit.

async function ensureMakerSetup(ctx: Ctx): Promise<{ balance: bigint }> {
  const { pub } = ctx;
  const me = KEEPER_ADDRESS;
  const c = VSET_CONTRACTS;
  const allowance = (spender: Address) =>
    pub.readContract({ address: c.usdc, abi: virtualUsdcAbi, functionName: "allowance", args: [me, spender] });
  const [toExchange, toPositions, toOracle, operator, credits, balance] = await Promise.all([
    allowance(c.exchange),
    allowance(c.positions),
    allowance(c.oracle),
    pub.readContract({
      address: c.positions,
      abi: virtualConditionalPositionsAbi,
      functionName: "isApprovedForAll",
      args: [me, c.exchange],
    }),
    pub.readContract({ address: c.oracle, abi: virtualResolutionOracleAbi, functionName: "credits", args: [me] }),
    pub.readContract({ address: c.usdc, abi: virtualUsdcAbi, functionName: "balanceOf", args: [me] }),
  ]);
  const half = MAKER_ALLOWANCE / 2n;
  for (const [current, spender] of [
    [toExchange, c.exchange],
    [toPositions, c.positions],
    [toOracle, c.oracle],
  ] as const) {
    if (current >= half) continue;
    const data = encodeFunctionData({
      abi: virtualUsdcAbi,
      functionName: "approve",
      args: [spender, MAKER_ALLOWANCE],
    });
    await send(ctx, c.usdc, data, GAS.approve, "approve");
  }
  if (!operator) {
    const data = encodeFunctionData({
      abi: virtualConditionalPositionsAbi,
      functionName: "setApprovalForAll",
      args: [c.exchange, true],
    });
    await send(ctx, c.positions, data, GAS.approve, "setApprovalForAll");
  }
  if (credits >= BOND_WITHDRAW_AT) {
    const data = encodeFunctionData({ abi: virtualResolutionOracleAbi, functionName: "withdrawBondCredit" });
    await send(ctx, c.oracle, data, GAS.withdraw, "withdrawBondCredit");
  }
  return { balance };
}

// ---------------------------------------------------------------------------------------------------------------
// Step 2: plan, create and stock markets for the pages people are watching.

async function planWindows(ctx: Ctx, rows: MarketRow[], nowSec: number): Promise<void> {
  const known = new Set(rows.map((row) => row.key));
  const fresh: PlannedWindow[] = [];
  for (const id of ctx.hot) {
    const [asset, minutes] = id.split(":");
    for (const window of plannedWindows(nowSec, asset as VsetAsset, Number(minutes)))
      if (!known.has(window.key)) fresh.push(window);
  }
  if (!fresh.length) return;
  const { data, error } = await ctx.db
    .from("vset_markets")
    .upsert(
      fresh.map((w) => ({
        key: w.key,
        asset: w.asset,
        minutes: w.minutes,
        start_at: iso(w.startSec),
        end_at: iso(w.endSec),
        open_at: iso(w.openAtSec),
      })),
      { onConflict: "key", ignoreDuplicates: true },
    )
    .select("*");
  if (error) throw dbError("plan windows", error);
  // Only rows that did not exist before come back; rows that were already finished or failed are left alone.
  for (const row of (data ?? []) as MarketRow[]) rows.push(row);
}

/** Clear recoverable create/split failures so a hot window can be tried again while time remains. */
async function reviveFailedCreates(ctx: Ctx, rows: MarketRow[], nowSec: number): Promise<void> {
  for (const row of rows) {
    if (!row.failed || row.market_id !== null || !ctx.hot.has(hotKey(row.asset, row.minutes))) continue;
    if (secOf(row.end_at) - nowSec < 60) continue;
    const err = row.last_error ?? "";
    const createTries = retryCount(err, "create");
    const splitTries = retryCount(err, "split");
    const recoverable =
      /create reverted|split reverted|create: no market id/i.test(err) ||
      (createTries > 0 && createTries < 3) ||
      (splitTries > 0 && splitTries < 3);
    if (!recoverable) continue;
    if (createTries >= 3 || splitTries >= 3) continue;
    row.failed = false;
    row.create_tx = null;
    row.split_tx = null;
    row.inventory_ready = false;
    await patchMarket(ctx.db, row.key, {
      failed: false,
      create_tx: null,
      split_tx: null,
      inventory_ready: false,
      last_error: err || "retrying create",
    });
    ctx.report.notes.push(`revived ${row.key}`);
  }
}

async function createMarkets(ctx: Ctx, rows: MarketRow[], nowSec: number): Promise<void> {
  const todo = rows
    .filter((row) => !row.create_tx && !row.failed && ctx.hot.has(hotKey(row.asset, row.minutes)))
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  for (const row of todo) {
    const startSec = secOf(row.start_at);
    const endSec = secOf(row.end_at);
    // Pre-open windows keep the lead buffer; mid-window recoveries open immediately so stocking can finish this tick.
    const openAtSec =
      startSec <= nowSec ? nowSec : Math.max(startSec - PRE_OPEN_SEC, nowSec + OPEN_LEAD_SEC);
    if (endSec - Math.max(startSec, openAtSec) < 45) {
      row.failed = true;
      await patchMarket(ctx.db, row.key, { failed: true, last_error: "window passed before it could be created" });
      continue;
    }
    const window: PlannedWindow = {
      key: row.key,
      asset: row.asset,
      minutes: row.minutes,
      startSec,
      endSec,
      openAtSec,
    };
    const { terms, metadataURI } = marketTerms(window);
    const data = encodeFunctionData({
      abi: virtualMarketFactoryAbi,
      functionName: "createMarket",
      args: [terms, metadataURI],
    });
    const hash = await send(ctx, VSET_CONTRACTS.factory, data, GAS.create, `create ${row.key}`);
    row.create_tx = hash;
    row.open_at = iso(openAtSec);
    await patchMarket(ctx.db, row.key, { create_tx: hash, open_at: row.open_at });
  }
}

async function stockMarkets(ctx: Ctx, rows: MarketRow[], nowSec: number): Promise<MarketRow[]> {
  const stocked: MarketRow[] = [];
  const watched = rows.filter(
    (row) => row.market_id !== null && !row.failed && ctx.hot.has(hotKey(row.asset, row.minutes)),
  );
  for (const row of watched) {
    if (row.split_tx || row.market_id === null) continue;
    if (nowSec > secOf(row.end_at) - 25) continue;
    // Stock once the market exists and its open time (or the window start) has been reached.
    if (nowSec < secOf(row.open_at) && nowSec < secOf(row.start_at)) continue;
    const data = encodeFunctionData({
      abi: virtualConditionalPositionsAbi,
      functionName: "split",
      args: [BigInt(row.market_id), INVENTORY_PER_SIDE],
    });
    const hash = await send(ctx, VSET_CONTRACTS.positions, data, GAS.split, `split ${row.key}`);
    row.split_tx = hash;
    stocked.push(row);
    await patchMarket(ctx.db, row.key, { split_tx: hash });
  }
  // Top up a side that is running low in a market people are trading.
  const trading = watched.filter(
    (row) => row.inventory_ready && nowSec < secOf(row.end_at) - 40 && nowSec >= secOf(row.start_at),
  );
  if (trading.length) {
    const balances = await Promise.all(
      trading.map(async (row) => {
        const id = row.market_id as number;
        const [up, down] = await Promise.all([tokenIdOf(id, 0), tokenIdOf(id, 1)]);
        const read = (token: bigint) =>
          ctx.pub.readContract({
            address: VSET_CONTRACTS.positions,
            abi: virtualConditionalPositionsAbi,
            functionName: "balanceOf",
            args: [KEEPER_ADDRESS, token],
          });
        const [a, b] = await Promise.all([read(up), read(down)]);
        return a < INVENTORY_LOW_WATER || b < INVENTORY_LOW_WATER;
      }),
    );
    for (let i = 0; i < trading.length; i += 1) {
      const row = trading[i];
      if (!row || !balances[i] || row.market_id === null) continue;
      const data = encodeFunctionData({
        abi: virtualConditionalPositionsAbi,
        functionName: "split",
        args: [BigInt(row.market_id), INVENTORY_PER_SIDE],
      });
      await send(ctx, VSET_CONTRACTS.positions, data, GAS.split, `top-up ${row.key}`);
    }
  }
  return stocked;
}

// ---------------------------------------------------------------------------------------------------------------
// Step 3: results.

type Prices = { open: number; close: number } | null;

async function windowPrices(rows: MarketRow[], nowSec: number): Promise<Map<string, Prices>> {
  const out = new Map<string, Prices>();
  const byAsset = new Map<VsetAsset, MarketRow[]>();
  for (const row of rows) byAsset.set(row.asset, [...(byAsset.get(row.asset) ?? []), row]);
  if (!byAsset.size) return out;
  const { spotWindowData } = await import("@/lib/updown/spot.server");
  const { windowResult } = await import("@/lib/updown/window.mjs");
  for (const [asset, list] of byAsset) {
    const oldest = Math.min(...list.map((row) => secOf(row.start_at)));
    const minutes = Math.min(290, Math.ceil((nowSec - oldest) / 60) + 3);
    try {
      const data = await spotWindowData(asset, minutes);
      for (const row of list) {
        const result = windowResult(
          data.candles,
          { start: secOf(row.start_at) * 1000, end: secOf(row.end_at) * 1000, minutes: row.minutes },
          60_000,
        );
        out.set(row.key, result ? { open: result.open, close: result.close } : null);
      }
    } catch {
      for (const row of list) out.set(row.key, null);
    }
  }
  return out;
}

async function proposeAndFinalize(ctx: Ctx, rows: MarketRow[], nowSec: number): Promise<void> {
  // Finalize first: it frees the bond sooner and never needs a price.
  for (const row of rows) {
    if (row.failed || row.market_id === null || !row.proposed_at || row.finalize_tx || row.resolved) continue;
    if (nowSec < secOf(row.proposed_at) + CHALLENGE_WAIT_SEC) continue;
    const data = encodeFunctionData({
      abi: virtualResolutionOracleAbi,
      functionName: "finalize",
      args: [BigInt(row.market_id)],
    });
    const hash = await send(ctx, VSET_CONTRACTS.oracle, data, GAS.finalize, `finalize ${row.key}`);
    row.finalize_tx = hash;
    await patchMarket(ctx.db, row.key, { finalize_tx: hash });
  }
  const ready = rows.filter(
    (row) =>
      !row.failed &&
      row.market_id !== null &&
      row.split_tx &&
      !row.propose_tx &&
      nowSec >= secOf(row.end_at) + PROPOSE_DELAY_SEC,
  );
  if (!ready.length) return;
  const prices = await windowPrices(ready, nowSec);
  for (const row of ready) {
    if (row.market_id === null) continue;
    if (nowSec > secOf(row.end_at) + RESOLUTION_WINDOW_SEC - 300) {
      row.failed = true;
      await patchMarket(ctx.db, row.key, { failed: true, last_error: "resolution window missed" });
      continue;
    }
    const seen = prices.get(row.key);
    if (!seen) {
      ctx.report.notes.push(`no final candle yet for ${row.key}`);
      continue;
    }
    const decided = windowOutcome(seen.open, seen.close);
    if (!decided) continue;
    const evidenceHash = evidenceHashFor({
      key: row.key,
      source: "coinbase-exchange candles 60s",
      open: seen.open,
      close: seen.close,
      outcome: decided.voided ? "void" : decided.outcome === 0 ? "Up" : "Down",
    });
    const data = encodeFunctionData({
      abi: virtualResolutionOracleAbi,
      functionName: "propose",
      args: [
        BigInt(row.market_id),
        decided.outcome,
        decided.voided,
        evidenceHash,
        sourceHashFor(row.asset),
        BigInt(Math.floor(secOf(row.end_at))),
      ],
    });
    const hash = await send(ctx, VSET_CONTRACTS.oracle, data, GAS.propose, `propose ${row.key}`);
    row.propose_tx = hash;
    await patchMarket(ctx.db, row.key, {
      propose_tx: hash,
      outcome: decided.outcome,
      voided: decided.voided,
      strike: seen.open,
      end_price: seen.close,
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Step 4: pay out winners.

async function payOut(ctx: Ctx, rows: MarketRow[], nowSec: number): Promise<void> {
  const done = rows.filter((row) => row.resolved && !row.redeemed && row.market_id !== null);
  if (!done.length) return;
  const ids = done.map((row) => row.market_id as number);
  const { data, error } = await ctx.db.from("vset_fills").select("market_id,account").in("market_id", ids);
  if (error) throw dbError("fills for payout", error);
  const holders = new Map<number, Set<string>>();
  for (const fill of (data ?? []) as { market_id: number; account: string }[]) {
    const set = holders.get(fill.market_id) ?? new Set<string>();
    set.add(fill.account);
    holders.set(fill.market_id, set);
  }
  for (const row of done) {
    const marketId = row.market_id as number;
    const accounts = [KEEPER_ADDRESS.toLowerCase(), ...(holders.get(marketId) ?? [])];
    const claims = await Promise.all(
      accounts.map((account) =>
        ctx.pub
          .readContract({
            address: VSET_CONTRACTS.positions,
            abi: virtualConditionalPositionsAbi,
            functionName: "claimable",
            args: [BigInt(marketId), account as Address],
          })
          .catch(() => 0n),
      ),
    );
    const owed = accounts.filter((_, i) => (claims[i] ?? 0n) > 0n);
    if (!owed.length) {
      row.redeemed = true;
      await patchMarket(ctx.db, row.key, { redeemed: true });
      continue;
    }
    const recently = row.redeem_sent_at && nowSec - secOf(row.redeem_sent_at) < 40;
    if (recently) continue;
    for (const account of owed) {
      const data = encodeFunctionData({
        abi: virtualConditionalPositionsAbi,
        functionName: "redeemFor",
        args: [BigInt(marketId), account as Address],
      });
      await send(ctx, VSET_CONTRACTS.positions, data, GAS.redeem, `redeem ${row.key} ${account.slice(0, 8)}`);
    }
    row.redeem_sent_at = iso(nowSec);
    await patchMarket(ctx.db, row.key, { redeem_sent_at: row.redeem_sent_at });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Step 5: index fills.

async function indexFills(ctx: Ctx, rows: MarketRow[]): Promise<void> {
  const head = Number(await ctx.pub.getBlockNumber());
  const last = await readScanBlock(ctx.db);
  if (last === null) {
    await writeScanBlock(ctx.db, head);
    return;
  }
  if (head <= last) return;
  const to = Math.min(head, last + 1500);
  const logs = await ctx.pub.getLogs({
    address: VSET_CONTRACTS.exchange,
    event: tradeExecutedEvent,
    fromBlock: BigInt(last + 1),
    toBlock: BigInt(to),
  });
  const keyOf = new Map<number, string>();
  for (const row of rows) if (row.market_id !== null) keyOf.set(row.market_id, row.key);
  const fills = fillRowsFromLogs(logs, keyOf);
  if (fills.length) {
    const { error } = await ctx.db
      .from("vset_fills")
      .upsert(fills, { onConflict: "tx_hash,log_index", ignoreDuplicates: true });
    if (error) throw dbError("index fills", error);
    ctx.report.notes.push(`indexed ${fills.length} fill(s)`);
  }
  await writeScanBlock(ctx.db, to);
}

// ---------------------------------------------------------------------------------------------------------------

async function runTick(db: SupabaseClient, report: TickReport): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  const pub = publicClient();
  const account = keeperAccount();

  const hotSince = new Date(Date.now() - HOT_MINUTES * 60_000).toISOString();
  const [hotResult, rowsResult] = await Promise.all([
    db.from("vset_hot").select("asset,minutes").gte("seen_at", hotSince),
    db
      .from("vset_markets")
      .select("*")
      .eq("redeemed", false)
      .eq("failed", false)
      .order("start_at", { ascending: true })
      .limit(300),
  ]);
  if (hotResult.error) throw dbError("hot pages", hotResult.error);
  if (rowsResult.error) throw dbError("open markets", rowsResult.error);
  const hot = new Set(
    ((hotResult.data ?? []) as { asset: string; minutes: number }[]).map((r) => hotKey(r.asset, r.minutes)),
  );
  const rows = (rowsResult.data ?? []) as MarketRow[];

  const [nonce, fees, balance] = await Promise.all([
    pub.getTransactionCount({ address: account.address, blockTag: "pending" }),
    pub.estimateFeesPerGas(),
    pub.getBalance({ address: account.address }),
  ]);
  const ctx: Ctx = {
    db,
    pub,
    wallet: walletClientFor(account),
    nonce,
    maxFeePerGas: (fees.maxFeePerGas * 3n) / 2n,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    sent: 0,
    report,
    hot,
  };

  await settleReceipts(ctx, rows);

  let stocked: MarketRow[] = [];
  if (balance < MIN_KEEPER_ETH) {
    report.errors.push("keeper wallet is out of ETH for gas");
  } else {
    try {
      const setup = await ensureMakerSetup(ctx);
      if (setup.balance < LOW_FLOAT) report.errors.push("market maker float is low");
      await proposeAndFinalize(ctx, rows, nowSec);
      await payOut(ctx, rows, nowSec);
      await planWindows(ctx, rows, nowSec);
      await reviveFailedCreates(ctx, rows, nowSec);
      await createMarkets(ctx, rows, nowSec);
      stocked = await stockMarkets(ctx, rows, nowSec);
    } catch (error) {
      if (!(error instanceof BudgetReached)) throw error;
      report.notes.push("transaction budget reached; the rest continues next run");
    }
  }

  // Tidy: past windows that were never stocked need nothing on chain and stop being loaded.
  for (const row of rows) {
    if (row.failed || row.redeemed || row.split_tx) continue;
    if (nowSec > secOf(row.end_at) + 60) {
      row.redeemed = true;
      await patchMarket(db, row.key, { redeemed: true, last_error: row.create_tx ? null : "window passed" });
    }
  }

  // Wait briefly for what was just sent, then stock in the same tick once create receipts land.
  const fresh = rows.filter((row) => row.create_tx && row.market_id === null);
  if (fresh.length || stocked.length) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await settleReceipts(ctx, rows);
  }
  if (balance >= MIN_KEEPER_ETH) {
    try {
      const more = await stockMarkets(ctx, rows, Math.floor(Date.now() / 1000));
      if (more.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await settleReceipts(ctx, rows);
      }
    } catch (error) {
      if (!(error instanceof BudgetReached)) throw error;
      report.notes.push("transaction budget reached while stocking; the rest continues next run");
    }
  }

  await indexFills(ctx, rows);
}

/** Runs one keeper pass. Safe to call from anywhere: a second caller while one is running just returns "busy". */
export async function keeperTick(): Promise<TickReport> {
  const started = Date.now();
  const report: TickReport = { ok: true, actions: [], notes: [], errors: [], ms: 0 };
  let db: SupabaseClient | null = null;
  let locked = false;
  try {
    db = await vdb();
    locked = await acquireKeeperLock(db, LOCK_SECONDS);
    if (!locked) {
      report.skipped = "busy";
      return { ...report, ms: Date.now() - started };
    }
    await runTick(db, report);
  } catch (error) {
    report.ok = false;
    report.errors.push(messageOf(error));
  } finally {
    if (db && locked) await releaseKeeperLock(db).catch(() => undefined);
  }
  report.ms = Date.now() - started;
  if (report.errors.length) report.ok = false;
  return report;
}
