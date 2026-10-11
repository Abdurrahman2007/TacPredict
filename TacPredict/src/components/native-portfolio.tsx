import { createWalletClient, custom, type Address } from "viem";
import { base } from "viem/chains";
import { getWalletLinkChallenge, proveWalletLink } from "@/lib/protocol/wallet-link.functions";
import { visiblePositions } from "@/lib/protocol/portfolio-view.mjs";
import { useOwnProtocolOrders } from "@/lib/protocol/portfolio-orders";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ArrowUpRight, RefreshCw } from "lucide-react";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { useLoginDialog } from "@/components/login-dialog";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { atomicDecimal } from "@/lib/protocol/types";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { claimPosition } from "@/lib/protocol/execution";
export function NativePortfolio({
  tab,
  search = "",
  sort = "value",
  descending = true,
  activeOnly = false,
}: {
  tab: string;
  search?: string;
  sort?: string;
  descending?: boolean;
  activeOnly?: boolean;
}) {
  const q = useNativePortfolio(),
    auth = useProtocolUser(),
    login = useLoginDialog(),
    wallet = useBaseWallet(),
    feed = useQuery(nativeMarketFeedQueryOptions);
  const orders = useOwnProtocolOrders();
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const positions = visiblePositions(q.data?.positions ?? [], search, sort, descending, activeOnly);
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
        <div className="finance-card space-y-4" aria-label="Loading portfolio" aria-busy="true">
          <div className="h-4 w-2/3 rounded bg-secondary" />
          <div className="h-3 w-1/2 rounded bg-secondary" />
          <div className="h-11 rounded bg-secondary" />
        </div>
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
        <EmptyState
          title={
            tab === "Open"
              ? "No open orders."
              : tab === "Activity"
                ? "No history yet."
                : "No positions found."
          }
          description={
            tab === "Open"
              ? "You have no unfilled orders right now."
              : tab === "Activity"
                ? "Your confirmed transactions will appear here."
                : "Your confirmed positions will appear here."
          }
        />
      ) : tab === "Open" ? (
        orders.isPending ? (
          <div className="finance-card" role="status">
            Loading orders…
          </div>
        ) : orders.isError ? (
          <div className="finance-card" role="alert">
            Open orders unavailable.
            <button className="finance-pill mt-3" onClick={() => void orders.refetch()}>
              Retry
            </button>
          </div>
        ) : !(orders.data ?? []).filter((o) => o.title.toLowerCase().includes(search.toLowerCase()))
            .length ? (
          <EmptyState
            title="No open orders."
            description="You have no unfilled orders right now."
          />
        ) : (
          (orders.data ?? [])
            .filter((o) => o.title.toLowerCase().includes(search.toLowerCase()))
            .map((o) => (
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
                    {o.side} · Outcome {o.outcomeIndex + 1} · {atomicDecimal(o.remainingAtomic)}{" "}
                    shares
                  </span>
                  <span>Limit {atomicDecimal(o.priceAtomic)} USDC</span>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {o.status === "PARTIAL" ? "Partially filled" : "Unfilled"} · Expires{" "}
                  {new Date(o.expiration).toLocaleString()}
                </p>
              </article>
            ))
        )
      ) : !q.data?.walletLinked ? (
        <div className="finance-card text-center">
          <h3 className="text-sm font-semibold">Verify your wallet</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
            Verify wallet ownership to view positions.
          </p>
          {!auth.user ? (
            <button
              className="finance-pill finance-pill-primary mt-5"
              onClick={() => login("/profile")}
            >
              Sign in to your account
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
          activity.map((a) => (
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
                <p className="text-sm tabular-nums">{atomicDecimal(a.amountAtomic)} USDC</p>
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
          ))
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
                  {p.outcome} · {atomicDecimal(p.sharesAtomic)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Last-trade value</p>
                <p className="mt-1 tabular-nums">
                  {p.valueAtomic === null ? "—" : `${atomicDecimal(p.valueAtomic)} USDC`}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Claimable</p>
                <p className="mt-1 tabular-nums">{atomicDecimal(p.claimableAtomic)} USDC</p>
              </div>
            </div>
            <p className="mt-4 text-[11px] text-muted-foreground">
              P&amp;L — · Cost basis not yet indexed
            </p>
            {BigInt(p.claimableAtomic) > 0n && (
              <div className="mt-4">
                <button
                  className="finance-pill finance-pill-primary"
                  disabled={
                    busy ||
                    !feed.data?.deployments.some((d) => d.chainId === p.chainId) ||
                    wallet.address?.toLowerCase() !== p.wallet ||
                    wallet.chainId !== p.chainId
                  }
                  onClick={() => void claim(p)}
                >
                  {busy ? "Processing…" : p.status === "VOID" ? "Redeem void shares" : "Claim USDC"}
                </button>
                {wallet.address?.toLowerCase() !== p.wallet && (
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
