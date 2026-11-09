/**
 * Sign-in for smart-contract wallets (Base Account and similar). Supabase's own wallet sign-in only understands the
 * 65-byte signature of a single-key wallet, so for everything longer the server asks Base whether the wallet's contract
 * accepts the signature (ERC-1271, or ERC-6492 for a wallet that is not deployed yet). When it does, the wallet gets one
 * account of its own and a one-time link that the browser trades for a normal Supabase session.
 *
 * The account carries `app_metadata.wallet_address`, which only this service-role code can write. The wallet is also
 * recorded in `protocol_wallets` as verified, which is what every wallet-gated server function checks.
 */
import { parseSiweMessage } from "viem/siwe";
import type { Address, Hex } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publicClient } from "@/lib/virtual-set/onchain.server";
import {
  MAX_MESSAGE_CHARS,
  checkSignInMessage,
  isSignatureShape,
  linkDecision,
  walletAppMetadata,
  walletEmail,
} from "./smart-wallet-policy.mjs";

export type SmartSignInResult =
  | { ok: true; tokenHash: string; address: string }
  | {
      ok: false;
      reason:
        | "bad_message"
        | "wrong_site"
        | "expired"
        | "bad_signature"
        | "address_taken"
        | "unavailable";
      /** Which step failed (never a secret); shown to the person so a failure can be traced. */
      detail?: string;
    };

const brief = (error: unknown): string => {
  const text =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error ?? "");
  return text.replace(/\s+/g, " ").slice(0, 90);
};

const admin = supabaseAdmin as unknown as SupabaseClient;

const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");

type AdminUser = {
  id: string;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

function ownsAccount(user: AdminUser, address: string): boolean {
  const app = user.app_metadata ?? {};
  return (
    app["wallet_auth"] === "smart" &&
    typeof app["wallet_address"] === "string" &&
    app["wallet_address"].toLowerCase() === address
  );
}

export async function smartWalletSignIn(input: {
  message: string;
  signature: string;
  hosts: string[];
}): Promise<SmartSignInResult> {
  const { message, signature, hosts } = input;
  if (message.length > MAX_MESSAGE_CHARS || !isSignatureShape(signature))
    return { ok: false, reason: "bad_message" };

  let fields: ReturnType<typeof parseSiweMessage>;
  try {
    fields = parseSiweMessage(message);
  } catch {
    return { ok: false, reason: "bad_message" };
  }
  const checked = checkSignInMessage({ fields, hosts, nowMs: Date.now() });
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const address = checked.address;

  // Ask Base whether the wallet accepts this signature for this exact message.
  let accepted = false;
  try {
    accepted = await publicClient().verifyMessage({
      address: address as Address,
      message,
      signature: signature as Hex,
    });
  } catch (error) {
    console.error("[wallet-signin] signature check failed", error);
    return { ok: false, reason: "unavailable", detail: `check: ${brief(error)}` };
  }
  if (!accepted)
    return { ok: false, reason: "bad_signature", detail: `signature ${signature.length} chars` };

  try {
    const email = walletEmail(address);
    const metadata = walletAppMetadata(address);

    // One account per wallet. Creating is a no-op error when it already exists.
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: metadata,
    });
    let user = (created.data?.user ?? null) as AdminUser | null;
    if (
      created.error &&
      !/already|exists|registered/i.test(`${created.error.code ?? ""} ${created.error.message}`)
    ) {
      console.error("[wallet-signin] could not create the account", created.error);
      return { ok: false, reason: "unavailable", detail: `account: ${brief(created.error)}` };
    }

    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.error("[wallet-signin] could not issue a sign-in link", link.error);
      return { ok: false, reason: "unavailable", detail: `link: ${brief(link.error)}` };
    }
    user ??= (link.data?.user ?? null) as AdminUser | null;
    if (!user) return { ok: false, reason: "unavailable", detail: "account: missing" };

    if (!ownsAccount(user, address)) {
      // An account with this address exists but was not made by this service: only an unconfirmed one (someone
      // pre-registering the address) may be taken over, and it gets a random password so the pre-registrant is locked out.
      if (user.email_confirmed_at) return { ok: false, reason: "address_taken" };
      const fixed = await admin.auth.admin.updateUserById(user.id, {
        email_confirm: true,
        password: randomPassword(),
        app_metadata: metadata,
      });
      if (fixed.error)
        return { ok: false, reason: "unavailable", detail: `account: ${brief(fixed.error)}` };
    }

    // The wallet is proven to belong to this account. Record it as verified, unless it is already linked to another
    // account (for example the owner's email account): then that link stays, and this wallet account still works on
    // chain because its token carries the wallet address (see claimsOwnWallet).
    const existing = await admin
      .from("protocol_wallets")
      .select("user_id")
      .eq("address", address)
      .maybeSingle();
    if (existing.error)
      return {
        ok: false,
        reason: "unavailable",
        detail: `wallet: ${brief(existing.error)}`,
      };
    const holder = (existing.data as { user_id: string | null } | null)?.user_id ?? null;
    if (linkDecision(holder, user.id) === "link") {
      const saved = await admin
        .from("protocol_wallets")
        .upsert(
          { address, user_id: user.id, verified_at: new Date().toISOString() },
          { onConflict: "address" },
        );
      if (saved.error) {
        console.error("[wallet-signin] could not record the wallet", saved.error);
        return {
          ok: false,
          reason: "unavailable",
          detail: `wallet: ${brief(saved.error)}`,
        };
      }
    }

    return { ok: true, tokenHash, address };
  } catch (error) {
    console.error("[wallet-signin] unexpected failure", error);
    return { ok: false, reason: "unavailable", detail: `error: ${brief(error)}` };
  }
}
