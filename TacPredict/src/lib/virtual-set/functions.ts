import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { claimsOwnWallet } from "@/lib/onchain/smart-wallet-policy.mjs";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const atomic = z.string().regex(/^\d{1,30}$/);

/** Whether on-chain trading is switched on (Cloudflare variable VSET_TRADING_ENABLED=1 plus the operator secrets). */
export const getOnchainStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { onchainEnabled } = await import("./window.server");
  return { enabled: onchainEnabled() };
});

export const getOnchainWindow = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) =>
    z
      .object({
        asset: z.enum(["bitcoin", "ethereum", "solana", "bnb"]),
        minutes: z.number().int().min(1).max(1440),
        start: z.number().int().positive(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { onchainWindow } = await import("./window.server");
    return onchainWindow(data);
  });

/** User-tapped prepare: wait for keeper create/stock then return readiness. */
export const prepareOnchainWindow = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        asset: z.enum(["bitcoin", "ethereum", "solana", "bnb"]),
        minutes: z.number().int().min(1).max(1440),
        start: z.number().int().positive(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { onchainWindow } = await import("./window.server");
    return onchainWindow({ ...data, awaitKeeper: true });
  });

export const quoteOnchain = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        key: z.string().max(120),
        outcome: z.union([z.literal(0), z.literal(1)]),
        side: z.enum(["buy", "sell"]),
        taker: address,
        usdc: atomic.optional(),
        shares: atomic.optional(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { onchainEnabled } = await import("./window.server");
    if (!onchainEnabled()) return { ok: false as const, reason: "unavailable" as const };
    const { signQuote } = await import("./quote.server");
    try {
      return await signQuote(data);
    } catch {
      return { ok: false as const, reason: "unavailable" as const };
    }
  });

export const getOnchainPortfolio = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ wallet: address }).parse(value))
  .handler(async ({ data }) => {
    const { onchainEnabled } = await import("./window.server");
    if (!onchainEnabled()) return null;
    const { readOnchainPortfolio } = await import("./portfolio.server");
    try {
      return await readOnchainPortfolio(data.wallet);
    } catch {
      return null;
    }
  });

/** Opens the one-time welcome box for a signed-in user's own verified wallet. */
export const openOnchainBox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => z.object({ wallet: address }).parse(value))
  .handler(async ({ data, context }) => {
    const { onchainEnabled } = await import("./window.server");
    if (!onchainEnabled()) return { ok: false as const, reason: "unavailable" as const };
    // A session made by signing in with this very wallet (smart wallets included) already proves ownership; any other
    // session needs the wallet verified on its account.
    if (!claimsOwnWallet(context.claims, data.wallet)) {
      const { ownsWallet } = await import("@/lib/virtual/database.server");
      try {
        await ownsWallet(
          context.supabase as unknown as SupabaseClient,
          context.userId,
          data.wallet,
        );
      } catch {
        return { ok: false as const, reason: "wallet_not_verified" as const };
      }
    }
    const { grantWelcomeBox } = await import("./box.server");
    return grantWelcomeBox(data.wallet);
  });

/** One-time welcome box status for a wallet (read from the chain). */
export const getOnchainBox = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ wallet: address }).parse(value))
  .handler(async ({ data }) => {
    const { onchainEnabled } = await import("./window.server");
    if (!onchainEnabled()) return null;
    const { boxStatus } = await import("./rewards.server");
    try {
      return await boxStatus(data.wallet);
    } catch {
      return null;
    }
  });

/** Daily check-in status for a wallet (read from the chain). */
export const getOnchainCheckin = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ wallet: address }).parse(value))
  .handler(async ({ data }) => {
    const { onchainEnabled } = await import("./window.server");
    if (!onchainEnabled()) return null;
    const { checkinStatus } = await import("./rewards.server");
    try {
      return await checkinStatus(data.wallet);
    } catch {
      return null;
    }
  });

/**
 * Called by the page right after the user's own fill is mined, so the new position shows up at once. It only reads the
 * receipt from the chain and records what that receipt proves; any hash is harmless.
 */
export const confirmOnchainTrade = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(value),
  )
  .handler(async ({ data }) => {
    const { onchainEnabled } = await import("./window.server");
    if (!onchainEnabled()) return { recorded: 0, pending: false };
    const { recordFillsForTx } = await import("./fills.server");
    try {
      return await recordFillsForTx(data.hash);
    } catch {
      return { recorded: 0, pending: true };
    }
  });
