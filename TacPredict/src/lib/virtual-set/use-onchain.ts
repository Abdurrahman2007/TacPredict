/**
 * React side of the on-chain Virtual USDC set: is it switched on, what does the connected wallet hold, and is a given
 * Up/Down window ready to trade. All of it is read through the server functions; nothing here signs anything.
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useContext } from "react";
import { BaseWalletContext } from "@/lib/onchain/wallet-context";
import { getOnchainBox, getOnchainCheckin, getOnchainPortfolio, getOnchainStatus, getOnchainWindow } from "./functions";
import { isVsetPair, parseMarketKey } from "./schedule.mjs";

export const onchainKeys = {
  status: ["vset", "status"] as const,
  portfolio: (wallet: string | null) => ["vset", "portfolio", wallet?.toLowerCase() ?? null] as const,
  window: (key: string | null) => ["vset", "window", key] as const,
  box: (wallet: string | null) => ["vset", "box", wallet?.toLowerCase() ?? null] as const,
  checkin: (wallet: string | null) => ["vset", "checkin", wallet?.toLowerCase() ?? null] as const,
};

/** True when this deployment trades on chain (VSET_TRADING_ENABLED=1 plus the operator secrets). */
export function useOnchainEnabled(): boolean {
  const query = useQuery({
    queryKey: onchainKeys.status,
    queryFn: () => getOnchainStatus(),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  return query.data?.enabled === true;
}

/** Wallet state without throwing when a page renders outside the wallet provider. */
export function useOptionalWallet() {
  return useContext(BaseWalletContext);
}

/** The connected wallet's on-chain Virtual USDC account (balance, positions, history), or null when off. */
export function useOnchainAccount() {
  const enabled = useOnchainEnabled();
  const address = useOptionalWallet()?.address ?? null;
  const query = useQuery({
    queryKey: onchainKeys.portfolio(address),
    queryFn: () => getOnchainPortfolio({ data: { wallet: address as string } }),
    enabled: enabled && address !== null,
    refetchInterval: 15_000,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
  return {
    enabled,
    address,
    portfolio: query.data ?? null,
    loading: enabled && address !== null && query.isPending,
  };
}

/** Pulls the wallet's account (and rewards) again right after something changed on chain. */
export function useRefreshOnchain() {
  const client = useQueryClient();
  const address = useOptionalWallet()?.address ?? null;
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: onchainKeys.portfolio(address) }),
      client.invalidateQueries({ queryKey: onchainKeys.box(address) }),
      client.invalidateQueries({ queryKey: onchainKeys.checkin(address) }),
    ]);
  }, [client, address]);
}

/** Window id the page already uses -> the pieces the server needs, or null when it is not a 5m/15m window. */
export function windowTarget(id: string) {
  const parsed = parseMarketKey(id);
  if (!parsed || !isVsetPair(parsed.asset, parsed.minutes)) return null;
  return parsed as { asset: "bitcoin" | "ethereum" | "solana" | "bnb"; startMs: number; minutes: number };
}

/**
 * Is this window ready for a trade? Asking also tells the server the page is being watched, so it prepares the
 * window's market ahead of the open. `supported` is false for lengths that do not trade on chain yet.
 */
export function useOnchainWindow(id: string | null) {
  const enabled = useOnchainEnabled();
  const target = id === null ? null : windowTarget(id);
  const query = useQuery({
    queryKey: onchainKeys.window(id),
    queryFn: () =>
      getOnchainWindow({ data: { asset: target!.asset, minutes: target!.minutes, start: target!.startMs } }),
    enabled: enabled && target !== null,
    // Poll faster while the market is still being created/stocked so "Preparing…" clears quickly.
    refetchInterval: (q) => (q.state.data?.ready === true ? 8_000 : 2_000),
    staleTime: 1_000,
    placeholderData: keepPreviousData,
  });
  return {
    enabled,
    /** The window is one that trades on chain (5 and 15 minutes). */
    supported: enabled && target !== null,
    ready: query.data?.ready === true,
    reason: query.data?.reason ?? null,
    loading: enabled && target !== null && query.isPending && !query.data,
    key: target ? id : null,
  };
}

export function useOnchainBox() {
  const enabled = useOnchainEnabled();
  const address = useOptionalWallet()?.address ?? null;
  const query = useQuery({
    queryKey: onchainKeys.box(address),
    queryFn: () => getOnchainBox({ data: { wallet: address as string } }),
    enabled: enabled && address !== null,
    staleTime: 10_000,
  });
  return { enabled, address, status: query.data ?? null, loading: enabled && address !== null && query.isPending };
}

export function useOnchainCheckinStatus() {
  const enabled = useOnchainEnabled();
  const address = useOptionalWallet()?.address ?? null;
  const query = useQuery({
    queryKey: onchainKeys.checkin(address),
    queryFn: () => getOnchainCheckin({ data: { wallet: address as string } }),
    enabled: enabled && address !== null,
    staleTime: 10_000,
    refetchInterval: 60_000,
  });
  return { enabled, address, status: query.data ?? null, loading: enabled && address !== null && query.isPending };
}
