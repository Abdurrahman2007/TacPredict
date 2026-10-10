import { createSiweMessage } from "viem/siwe";
import { getAddress, createPublicClient, http, type Hex, type Address } from "viem";
import { base } from "viem/chains";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
const db = supabaseAdmin as unknown as SupabaseClient;
function config() {
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["BASE_PROTOCOL_RPC_URL"])
    throw Error(
      "Verified wallet linking needs the server database key and Base RPC configuration.",
    );
  if (
    new URL(process.env["SUPABASE_URL"] ?? "https://invalid").hostname !==
    "lmqaiqvwcytmgwgwyfwx.supabase.co"
  )
    throw Error("Main project required");
}
export async function challenge(userId: string, address: string) {
  config();
  const since = new Date(Date.now() - 60000).toISOString();
  const recent = await db
    .from("protocol_wallet_link_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", since);
  if (recent.error || !Number.isInteger(recent.count) || recent.count! >= 5)
    throw Error("Wait before requesting another wallet challenge.");
  const expires = new Date(Date.now() + 300000);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const message = createSiweMessage({
    domain: "tacpredict.fun",
    address: getAddress(address),
    statement: `Link this wallet to TacPredict account ${userId}. This signature does not authorize a transaction or token transfer.`,
    uri: "https://tacpredict.fun",
    version: "1",
    chainId: 8453,
    nonce,
    issuedAt: new Date(),
    expirationTime: expires,
  });
  const { data, error } = await db
    .from("protocol_wallet_link_challenges")
    .insert({
      user_id: userId,
      address: address.toLowerCase(),
      message,
      expires_at: expires.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw Error("Could not create a wallet challenge");
  return { id: data.id as string, message };
}
export async function prove(userId: string, id: string, signature: string) {
  config();
  const { data: c, error } = await db
    .from("protocol_wallet_link_challenges")
    .select("address,message,expires_at,used_at")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !c || c.used_at || Date.parse(c.expires_at) <= Date.now())
    throw Error("Expired or unavailable challenge");
  const pub = createPublicClient({
    chain: base,
    transport: http(process.env["BASE_PROTOCOL_RPC_URL"]!),
  });
  if (
    (await pub.getChainId()) !== 8453 ||
    !(await pub.verifyMessage({
      address: c.address as Address,
      message: c.message,
      signature: signature as Hex,
    }))
  )
    throw Error("Wallet ownership signature invalid");
  const result = await db.rpc("consume_protocol_wallet_link", { _challenge: id, _user: userId });
  if (result.error) throw Error("Wallet already linked, challenge expired, or signature was used.");
  return { address: result.data as string };
}
