import { createPublicClient, http, hashTypedData, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  orderMessage,
  orderTypes,
  exchangeAbi,
  erc20Abi,
  positionAbi,
  registryReadAbi,
  type SignedOrder,
} from "./orders";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertMarketIdentity } from "./market-identity.mjs";
const db = supabaseAdmin as unknown as SupabaseClient;
export async function saveVerifiedOrder(
  input: { chainId: 8453 | 84532; marketUuid: string; order: SignedOrder; signature: string },
  userId: string,
) {
  if (
    new URL(process.env["SUPABASE_URL"] ?? "https://invalid").hostname !==
    "lmqaiqvwcytmgwgwyfwx.supabase.co"
  )
    throw Error("Main project required");
  const { data: d, error: de } = await db
    .from("protocol_deployments")
    .select("*")
    .eq("chain_id", input.chainId)
    .eq("verified", true)
    .eq("trading_enabled", true)
    .maybeSingle();
  if (de || !d) throw Error("Trading is not enabled on a verified deployment.");
  const rpc =
    process.env[input.chainId === 8453 ? "BASE_PROTOCOL_RPC_URL" : "BASE_SEPOLIA_PROTOCOL_RPC_URL"];
  if (!rpc) throw Error("Protocol RPC not configured.");
  const client = createPublicClient({
    chain: input.chainId === 8453 ? base : baseSepolia,
    transport: http(rpc),
  });
  if ((await client.getChainId()) !== input.chainId) throw Error("Chain mismatch");
  for (const key of ["registry", "exchange", "positions"]) {
    const code = await client.getBytecode({ address: d[key] as Address });
    if (!code || !d.code_hashes[key] || hashBytecode(code) !== d.code_hashes[key])
      throw Error("Deployment code verification failed");
  }
  const { data: m, error: me } = await db
    .from("protocol_markets")
    .select("onchain_id::text,api_market_id,chain_id,close_at,open_at,published,outcome_count")
    .eq("id", input.marketUuid)
    .maybeSingle();
  const o = orderMessage(input.order);
  if (
    me ||
    !m ||
    !m.published ||
    m.chain_id !== input.chainId ||
    String(m.onchain_id) !== input.order.marketId ||
    o.outcome >= m.outcome_count ||
    o.price <= 0n ||
    o.price >= 1000000n ||
    o.shares <= 0n ||
    Number(o.expiration) * 1000 > Date.parse(m.close_at) ||
    Number(o.expiration) * 1000 <= Date.now()
  )
    throw Error("Invalid market/order terms");
  assertMarketIdentity(
    { chainId: m.chain_id, onchainId: String(m.onchain_id), marketId: m.api_market_id },
    input.chainId,
  );
  const domain = {
    name: "TacPredictExchange",
    version: "1",
    chainId: input.chainId,
    verifyingContract: d.exchange as Address,
  };
  if (
    !(await client.verifyTypedData({
      address: o.maker,
      domain,
      types: orderTypes,
      primaryType: "Order",
      message: o,
      signature: input.signature as Hex,
    }))
  )
    throw Error("Invalid maker signature");
  const [open, nonce] = await Promise.all([
    client.readContract({
      address: d.registry as Address,
      abi: registryReadAbi,
      functionName: "isTradingOpen",
      args: [o.marketId],
    }),
    client.readContract({
      address: d.exchange as Address,
      abi: exchangeAbi,
      functionName: "minimumNonce",
      args: [o.maker],
    }),
  ]);
  if (!open || o.nonce < nonce) throw Error("Market closed or nonce revoked");
  const orderId = hashTypedData({ domain, types: orderTypes, primaryType: "Order", message: o });
  const [filled, cancelled] = await Promise.all([
    client.readContract({
      address: d.exchange as Address,
      abi: exchangeAbi,
      functionName: "filledShares",
      args: [orderId],
    }),
    client.readContract({
      address: d.exchange as Address,
      abi: exchangeAbi,
      functionName: "cancelled",
      args: [orderId],
    }),
  ]);
  if (cancelled || filled >= o.shares) throw Error("Order unavailable");
  if (o.isBuy) {
    const required = ((o.shares - filled) * o.price + 999999n) / 1000000n;
    const [balance, allowance] = await Promise.all([
      client.readContract({
        address: d.collateral_token as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [o.maker],
      }),
      client.readContract({
        address: d.collateral_token as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [o.maker, d.exchange as Address],
      }),
    ]);
    if (balance < required || allowance < required)
      throw Error("Insufficient USDC balance or exchange allowance");
  } else {
    const { data: outcome } = await db
      .from("protocol_market_outcomes")
      .select("token_id::text")
      .eq("market_uuid", input.marketUuid)
      .eq("outcome_index", o.outcome)
      .single();
    if (!outcome?.token_id) throw Error("Unindexed outcome");
    const chainToken = await client.readContract({
      address: d.positions as Address,
      abi: positionAbi,
      functionName: "tokenId",
      args: [o.marketId, o.outcome],
    });
    if (chainToken.toString() !== String(outcome.token_id))
      throw Error("Indexed outcome token mismatch");
    const [balance, approved] = await Promise.all([
      client.readContract({
        address: d.positions as Address,
        abi: positionAbi,
        functionName: "balanceOf",
        args: [o.maker, BigInt(outcome.token_id)],
      }),
      client.readContract({
        address: d.positions as Address,
        abi: positionAbi,
        functionName: "isApprovedForAll",
        args: [o.maker, d.exchange as Address],
      }),
    ]);
    if (balance < o.shares - filled || !approved)
      throw Error("Insufficient shares or exchange approval");
  }
  const { data: linked, error: linkError } = await db
    .from("protocol_wallets")
    .select("id")
    .eq("address", o.maker.toLowerCase())
    .eq("user_id", userId)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (linkError || !linked)
    throw Error("Verify this wallet ownership in Portfolio before placing an order.");
  // Signature proves maker ownership; account identity is never taken from editable user metadata.
  const { error } = await db.from("protocol_orders").upsert(
    {
      order_id: orderId,
      market_uuid: input.marketUuid,
      user_id: userId,
      maker: o.maker.toLowerCase(),
      taker: o.taker.toLowerCase(),
      outcome_index: o.outcome,
      side: o.isBuy ? "BUY" : "SELL",
      price_atomic: o.price.toString(),
      shares_atomic: o.shares.toString(),
      filled_atomic: filled.toString(),
      nonce: o.nonce.toString(),
      expiration: new Date(Number(o.expiration) * 1000).toISOString(),
      signature: input.signature,
      status: filled ? "PARTIAL" : "OPEN",
      signed_order: input.order,
    },
    { onConflict: "order_id", ignoreDuplicates: true },
  );
  if (error) throw Error("Could not store signed order");
  return { ok: true, orderId };
}
import { keccak256 as hashBytecode } from "viem";
