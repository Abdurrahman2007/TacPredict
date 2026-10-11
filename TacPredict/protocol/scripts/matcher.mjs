/** One deterministic price-time match per run; dry-run unless explicitly executed. Indexer owns financial writes. */
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { createDatabaseClient, withProtocolLease, safeError } from "./job-client.mjs";
const env = process.env;
for (const k of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PROTOCOL_RPC_URL",
  "PROTOCOL_CHAIN_ID",
])
  if (!env[k]) throw Error(`Missing ${k}`);
if (new URL(env.SUPABASE_URL).hostname !== "lmqaiqvwcytmgwgwyfwx.supabase.co")
  throw Error("Wrong project");
const id = Number(env.PROTOCOL_CHAIN_ID);
if (![8453, 84532].includes(id)) throw Error("Unsupported chain");
const execute = process.argv.includes("--execute");
if (execute && id === 8453 && env.MAINNET_MATCHING_APPROVED !== "true")
  throw Error("Mainnet activation requires separately reviewed approval");
const pub = createPublicClient({
  chain: id === 8453 ? base : baseSepolia,
  transport: http(env.PROTOCOL_RPC_URL),
});
if ((await pub.getChainId()) !== id) throw Error("RPC chain mismatch");
const abi = JSON.parse(
  fs.readFileSync(new URL("../artifacts/Exchange.json", import.meta.url), "utf8"),
).abi;
const rawDb = createDatabaseClient(env);
const db = (table, query) => rawDb(table, undefined, "?" + query);
try {
  await withProtocolLease(rawDb, id, "matcher", async (lease) => {
    const [d] = await db(
      "protocol_deployments",
      `chain_id=eq.${id}&verified=eq.true&trading_enabled=eq.true`,
    );
    if (!d) throw Error("No enabled verified deployment");
    const code = await pub.getBytecode({ address: d.exchange });
    const { keccak256 } = await import("viem");
    if (!code || keccak256(code) !== d.code_hashes.exchange)
      throw Error("Exchange bytecode mismatch");
    const orders = await db(
      "protocol_orders",
      `select=order_id,market_uuid,outcome_index,side,signed_order,signature,created_at&status=in.(OPEN,PARTIAL)&expiration=gt.${encodeURIComponent(new Date().toISOString())}&market_uuid=in.(${(await db("protocol_markets", `select=id&chain_id=eq.${id}`)).map((m) => m.id).join(",") || "00000000-0000-0000-0000-000000000000"})&limit=500&order=created_at.asc`,
    );
    const message = (o) => ({
      ...o,
      maker: o.maker,
      taker: o.taker,
      marketId: BigInt(o.marketId),
      price: BigInt(o.price),
      shares: BigInt(o.shares),
      nonce: BigInt(o.nonce),
      expiration: BigInt(o.expiration),
    });
    const sorted = (side) =>
      orders
        .filter((o) => o.side === side && o.signed_order.taker.toLowerCase() === zeroAddress)
        .sort((a, b) => {
          const pa = BigInt(a.signed_order.price),
            pb = BigInt(b.signed_order.price);
          return pa === pb
            ? a.created_at.localeCompare(b.created_at)
            : side === "BUY"
              ? pa > pb
                ? -1
                : 1
              : pa < pb
                ? -1
                : 1;
        });
    let candidate;
    outer: for (const buy of sorted("BUY"))
      for (const sell of sorted("SELL")) {
        if (
          buy.market_uuid !== sell.market_uuid ||
          buy.outcome_index !== sell.outcome_index ||
          buy.signed_order.maker.toLowerCase() === sell.signed_order.maker.toLowerCase() ||
          BigInt(buy.signed_order.price) < BigInt(sell.signed_order.price)
        )
          continue;
        const bf = await pub.readContract({
            address: d.exchange,
            abi,
            functionName: "filledShares",
            args: [buy.order_id],
          }),
          sf = await pub.readContract({
            address: d.exchange,
            abi,
            functionName: "filledShares",
            args: [sell.order_id],
          });
        const rb = BigInt(buy.signed_order.shares) - bf,
          rs = BigInt(sell.signed_order.shares) - sf;
        if (rb <= 0n || rs <= 0n) continue;
        const quantity = rb < rs ? rb : rs;
        const account = execute
          ? privateKeyToAccount(env.PROTOCOL_RELAYER_PRIVATE_KEY ?? "")
          : undefined;
        try {
          const simulated = await pub.simulateContract({
            address: d.exchange,
            abi,
            functionName: "matchOrders",
            args: [
              message(buy.signed_order),
              buy.signature,
              message(sell.signed_order),
              sell.signature,
              quantity,
            ],
            account: account ?? "0x0000000000000000000000000000000000000001",
          });
          candidate = { simulated, account, buy, sell, quantity };
          break outer;
        } catch {
          /* Stale approvals/nonces/liquidity: skip, never mark a failed match as a trade. */
        }
      }
    if (!candidate) {
      console.log("No executable crossing order pair.");
      return;
    }
    if (!execute) {
      console.log(
        JSON.stringify({
          dryRun: true,
          market: candidate.buy.market_uuid,
          sharesAtomic: candidate.quantity.toString(),
          priceAtomic: candidate.sell.signed_order.price,
        }),
      );
      return;
    }
    const wallet = createWalletClient({
      account: candidate.account,
      chain: id === 8453 ? base : baseSepolia,
      transport: http(env.PROTOCOL_RPC_URL),
    });
    await lease.assert();
    const gas = await pub.estimateContractGas(candidate.simulated.request);
    if (gas > 1000000n) throw Error("Matcher gas limit exceeded");
    const maxFeePerGas = (await pub.estimateFeesPerGas()).maxFeePerGas;
    if (!maxFeePerGas || maxFeePerGas > BigInt(env.PROTOCOL_MAX_FEE_WEI ?? "2000000000"))
      throw Error("Matcher fee cap exceeded");
    const hash = await wallet.writeContract({
      ...candidate.simulated.request,
      gas: gas + gas / 5n,
      maxFeePerGas,
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw Error("Settlement reverted");
    console.log(
      JSON.stringify({
        txHash: hash,
        status: "confirmed",
        financialWrites: "finalized indexer only",
      }),
    );
  });
} catch (error) {
  console.error(safeError(error, env));
  process.exitCode = 1;
}
