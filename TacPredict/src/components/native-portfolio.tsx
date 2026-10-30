import { createWalletClient, custom, type Address } from "viem";
import { base } from "viem/chains";
import { getWalletLinkChallenge, proveWalletLink } from "@/lib/protocol/wallet-link.functions";
import {
  filterPortfolioPositions,
  selectedWalletSummary,
  visiblePositions,
} from "@/lib/protocol/portfolio-view.mjs";
import { useOwnProtocolOrders } from "@/lib/protocol/portfolio-orders";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ArrowUpRight, RefreshCw } from "lucide-react";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { cancelSignedOrder, claimPosition } from "@/lib/protocol/execution";
import { signInWithEthereumWallet } from "@/lib/onchain/wallet-auth";
import { usdcShort, sharesShort } from "@/lib/protocol/display.mjs";
export function NativePortfolio({
  tab,
  search = "",
  sort = "value",
  descending = true,
  activeOnly = false,
  category = "All",
  state = "All",
  since = "",
}: {
  tab: string;
  search?: string;
  sort?: string;
  descending?: boolean;
  activeOnly?: boolean;
  category?: string;
  state?: string;
  since?: string;
}) {
  const q = useNativePortfolio(),
    auth = useProtocolUser(),
    access = useWalletAccess("/profile"),
    wallet = useBaseWallet(),
    feed = useQuery(nativeMarketFeedQueryOptions);
  const orders = useOwnProtocolOrders();
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const summary = selectedWalletSummary(
    q.data?.positions ?? [],
    wallet.address,
    q.data?.verifiedWallets ?? [],
    Boolean(auth.ready && auth.user && !q.isPending && !q.isError),
  );
  const positions = filterPortfolioPositions(
    visiblePositions(summary.positions, search, sort, descending, activeOnly),
    (feed.data?.markets ?? []).flatMap((m) => (m.native ? [m.native] : [])),
    category,
    state,
    since,
  );
  const ownOrders = (orders.data ?? []).filter(
    (o) =>
      o.order.maker.toLowerCase() === wallet.address?.toLowerCase() &&
      o.title.toLowerCase().includes(search.toLowerCase()),
  );
  const [cancelled, setCancelled] = useState<Record<string, string>>({});
  async function cancel(o: (typeof ownOrders)[number]) {
    const d = feed.data?.deployments.find((d) => d.chainId === o.chainId);
    if (!d || busy) return;
    if (
      !window.confirm(
        `Cancel this ${o.side.toLowerCase()} order? Base network gas applies. Filled shares are not reversed.`,
      )
    )
      return;
    setBusy(true);
    setNotice("");
    try {
      const hash = await cancelSignedOrder(wallet, d, o);
      setCancelled((old) => ({ ...old, [o.id]: hash }));
      setNotice(
        `Cancellation transaction confirmed: ${hash}. Finalized order history updates after indexing.`,
      );
      await orders.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Cancellation failed.");
    } finally {
      setBusy(false);
    }
  }
  async function claim(p: (typeof positions)[number]) {
    const d = feed.data?.deployments.find((d) => d.chainId === p.chainId);
    if (!d) return;
    setBusy(true);
    setNotice("");
    try {
      const hash = await claimPosition(wallet, d, p.onchainId, p.status === "VOID");
      setNotice(
        `Transaction confirmed: ${hash}. Your portfolio updates after indexer finalization.`,
      );
      await wallet.refresh();
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }
  async function signInWallet() {
    if (!wallet.provider || busy) return;
    setBusy(true);
    setNotice("");
    try {
      await signInWithEthereumWallet(wallet.provider);
    } catch (e) {
      const code = (e as { code?: number })?.code;
      setNotice(code === 4001 ? "Sign-in cancelled." : "Wallet sign-in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function linkWallet() {
    if (!wallet.provider || !wallet.address || !auth.user) return;
    setBusy(true);
    setNotice("");
    try {
      const c = await getWalletLinkChallenge({ data: { address: wallet.address } });
      const client = createWalletClient({
        chain: base,
        account: wallet.address as Address,
        transport: custom(wallet.provider),
      });
      const signature = await client.signMessage({ message: c.message });
      await proveWalletLink({ data: { id: c.id, signature } });
      setNotice("Wallet ownership verified. Positions are linked to your account.");
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Wallet verification failed.");
    } finally {
      setBusy(false);
    }
  }
  const activity = q.data?.activity;
  return (
    <div className="mt-4 space-y-3">
      {!auth.ready || (auth.user && q.isPending) ? (
        <p role="status" className="finance-inline-alert">
          Loading verified portfolio…
        </p>
      ) : q.isError ? (
        <div role="alert" className="finance-card">
          <h3 className="text-sm font-semibold">Positions unavailable</h3>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Finalized data could not be loaded. No estimate is substituted.
          </p>
          <button className="finance-pill mt-4" onClick={() => void q.refetch()}>
            Retry
            <RefreshCw size={14} />
          </button>
        </div>
      ) : !auth.user ? (
        wallet.address && wallet.provider ? (
          <div className="finance-card text-center">
            <h3 className="text-sm font-semibold">Sign in to see your positions</h3>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
              Your wallet is connected. Sign one free message to open your portfolio. It does not
              authorize any transaction.
            </p>
            <button
              className="finance-pill finance-pill-primary mt-5"
              disabled={busy}
              onClick={() => void signInWallet()}
            >
              {busy ? "Waiting for wallet…" : "Sign in with wallet"}
              <ShieldCheck size={15} />
            </button>
          </div>
        ) : (
          <EmptyState
            title="Connect your wallet"
            description="Sign in and verify wallet ownership to see private positions, orders and history."
          />
        )
      ) : tab === "Open" ? (
        orders.isPending ? (
          <p role="status">Loading open orders…</p>
        ) : orders.isError ? (
          <div className="finance-card" role="alert">
            Open orders unavailable.
            <button className="finance-pill mt-3" onClick={() => void orders.refetch()}>
              Retry
            </button>
          </div>
        ) : !ownOrders.length ? (
          <EmptyState
            title="No open orders."
            description="No unfilled orders were found for this wallet."
          />
        ) : (
          ownOrders.map((o) => (
            <article className="finance-card !p-4" key={o.id}>
              <Link
                to="/markets/$marketId"
                params={{ marketId: o.marketId }}
                className="text-sm font-semibold"
              >
                {o.title}
              </Link>
              <div className="mt-3 flex justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {o.side} · Outcome {o.outcomeIndex + 1} · {sharesShort(o.remainingAtomic)} shares
                </span>
                <span>Limit {usdcShort(o.priceAtomic)}</span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {o.status === "PARTIAL" ? "Partially filled" : "Unfilled"} · Expires{" "}
                {new Date(o.expiration).toLocaleString()}
              </p>
              {cancelled[o.id] ? (
                <a
                  className="finance-pill mt-3"
                  href={`https://basescan.org/tx/${cancelled[o.id]}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cancellation confirmed · view transaction
                </a>
              ) : (
                <button
                  className="finance-pill mt-3"
                  disabled={
                    busy ||
                    wallet.chainId !== o.chainId ||
                    !feed.data?.deployments.some((d) => d.chainId === o.chainId)
                  }
                  onClick={() => void cancel(o)}
                >
                  {busy ? "Waiting for wallet…" : "Cancel order"}
                </button>
              )}
            </article>
          ))
        )
      ) : !summary.verified ? (
        <div className="finance-card text-center">
          <h3 className="text-sm font-semibold">Verify your wallet</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
            Verify wallet ownership to view positions.
          </p>
          {!auth.user ? (
            <button
              className="finance-pill finance-pill-primary mt-5"
              disabled={access.busy}
              onClick={() => void access.run()}
            >
              {access.state === "verify" ? "Verify your wallet" : "Connect wallet"}
              <ArrowUpRight size={15} />
            </button>
          ) : wallet.address ? (
            <button className="finance-pill mt-5" disabled={busy} onClick={() => void linkWallet()}>
              {busy ? "Verifying…" : "Verify wallet ownership"}
              <ShieldCheck size={15} />
            </button>
          ) : (
            <p className="mt-4 text-xs text-primary">Connect your wallet above to continue.</p>
          )}
        </div>
      ) : tab === "Activity" ? (
        activity === null ? (
          <div role="status" className="finance-inline-alert">
            Finalized activity is unavailable. Try refreshing your portfolio.
          </div>
        ) : !activity?.length ? (
          <EmptyState
            title="No history yet."
            description="Your confirmed transactions will appear here."
          />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Account history · all verified wallets. Amounts are transfers, not profit/loss.
            </p>
            {activity
              .filter(
                (a) => a.chainId === 8453 && a.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((a) => (
                <article key={`${a.kind}-${a.id}`} className="finance-card !p-4">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <p className="text-sm font-semibold">{a.kind}</p>
                      <Link
                        to="/markets/$marketId"
                        params={{ marketId: a.marketId }}
                        className="mt-1 block text-xs text-muted-foreground"
                      >
                        {a.title}
                      </Link>
                    </div>
                    <p className="text-sm tabular-nums">{usdcShort(a.amountAtomic)}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(a.timestamp).toLocaleDateString()} · Finalized
                    </span>
                    <a
                      className="inline-flex min-h-11 items-center gap-1 text-xs text-primary"
                      href={`https://basescan.org/tx/${a.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Transaction
                      <ArrowUpRight size={13} />
                    </a>
                  </div>
                </article>
              ))}
          </>
        )
      ) : !positions.length ? (
        <EmptyState
          title="No positions found."
          description="Your confirmed positions will appear here."
        />
      ) : (
        positions.map((p) => (
          <article key={p.id} className="finance-card !p-4 sm:!p-5">
            <div className="flex items-start justify-between gap-3">
              <Link
                to="/markets/$marketId"
                params={{ marketId: p.marketId }}
                className="text-sm font-semibold leading-6"
              >
                {p.title}
              </Link>
              <span className="finance-badge shrink-0">
                {BigInt(p.claimableAtomic) > 0n ? "Claimable" : p.positionStatus}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
              <div>
                <p className="text-muted-foreground">Outcome · Shares</p>
                <p className="mt-1">
                  {p.outcome} · {sharesShort(p.sharesAtomic)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last-trade value</p>
                <p className="mt-1 tabular-nums">{usdcShort(p.valueAtomic)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Claimable</p>
                <p className="mt-1 tabular-nums">{usdcShort(p.claimableAtomic)}</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">Cost basis not yet indexed</p>
            {BigInt(p.claimableAtomic) > 0n && (
              <div className="mt-4">
                <button
                  className="finance-pill finance-pill-primary"
                  disabled={
                    busy ||
                    !feed.data?.deployments.some((d) => d.chainId === p.chainId) ||
                    wallet.address?.toLowerCase() !== p.wallet.toLowerCase() ||
                    wallet.chainId !== p.chainId
                  }
                  onClick={() => void claim(p)}
                >
                  {busy ? "Processing…" : p.status === "VOID" ? "Redeem void shares" : "Claim USDC"}
                </button>
                {wallet.address?.toLowerCase() !== p.wallet.toLowerCase() && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Connect the position’s owner wallet to claim.
                  </p>
                )}
              </div>
            )}
          </article>
        ))
      )}
      {notice && (
        <p role="status" className="finance-inline-alert break-all">
          {notice}
        </p>
      )}
    </div>
  );
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="tp-empty" role="status">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
