import { createWalletClient, custom, type Address } from "viem";
import { base } from "viem/chains";
import { getWalletLinkChallenge, proveWalletLink } from "@/lib/protocol/wallet-link.functions";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useNativePortfolio } from "@/lib/protocol/portfolio";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { atomicDecimal } from "@/lib/protocol/types";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { claimPosition } from "@/lib/protocol/execution";
export function NativePortfolio({ tab }: { tab: string }) {
  const q = useNativePortfolio(),
    wallet = useBaseWallet(),
    feed = useQuery(nativeMarketFeedQueryOptions);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const positions = q.data?.positions ?? [];
  const activity = positions.filter(
    (p) => p.positionStatus !== "OPEN" || BigInt(p.sharesAtomic) > 0n,
  );
  async function claim(p: (typeof positions)[number]) {
    const d = feed.data?.deployments.find((d) => d.chainId === p.chainId);
    if (!d) return;
    setBusy(true);
    try {
      const hash = await claimPosition(wallet, d, p.onchainId, p.status === "VOID");
      setNotice(`Claim confirmed: ${hash}. Finalized indexer will update your portfolio.`);
      await wallet.refresh();
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }
  async function linkWallet() {
    if (!wallet.provider || !wallet.address) return;
    setBusy(true);
    try {
      const c = await getWalletLinkChallenge({ data: { address: wallet.address } });
      const client = createWalletClient({
        chain: base,
        account: wallet.address as Address,
        transport: custom(wallet.provider),
      });
      const signature = await client.signMessage({ message: c.message });
      await proveWalletLink({ data: { id: c.id, signature } });
      setNotice("Wallet ownership verified. Portfolio linked to your account.");
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Linking failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      {q.isError ? (
        <p
          role="alert"
          className="rounded-2xl border border-border p-5 text-sm text-muted-foreground"
        >
          Native portfolio data unavailable. No estimated balance is substituted.
        </p>
      ) : !q.data?.walletLinked ? (
        <p className="rounded-2xl border border-dashed border-border bg-card/40 p-5 text-sm text-muted-foreground">
          Sign in with a verified wallet identity to link indexed on-chain positions. Google/X/email
          accounts need a separate wallet-ownership proof; a connected address alone is not proof.
        </p>
      ) : !(tab === "Activity" ? activity : positions).length ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          No indexed on-chain positions yet. Contracts and markets must launch before real trading.
        </p>
      ) : (
        (tab === "Activity" ? activity : positions).map((p) => (
          <article key={p.id} className="rounded-2xl border border-border bg-card p-4">
            <Link
              to="/markets/$marketId"
              params={{ marketId: p.marketId }}
              className="font-semibold"
            >
              {p.title}
            </Link>
            <p className="mt-2 text-sm">
              {p.outcome} · {atomicDecimal(p.sharesAtomic)} shares
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {p.positionStatus} · Last-trade value{" "}
              {p.valueAtomic === null ? "unavailable" : `${atomicDecimal(p.valueAtomic)} USDC`} ·
              Claimable {atomicDecimal(p.claimableAtomic)} USDC
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              P&amp;L unavailable until verified cost basis is indexed.
            </p>
            {BigInt(p.claimableAtomic) > 0n && (
              <button
                disabled={
                  busy ||
                  !feed.data?.deployments.some(
                    (d) => d.chainId === p.chainId && d.tradingEnabled,
                  ) ||
                  wallet.address?.toLowerCase() !== p.wallet
                }
                onClick={() => void claim(p)}
                className="mt-3 min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {p.status === "VOID" ? "Redeem void shares" : "Claim USDC"}
              </button>
            )}
          </article>
        ))
      )}
      {tab === "Activity" && q.data?.walletLinked && (
        <p className="text-xs text-muted-foreground">
          Position lifecycle above. Transaction activity is available on each market; a full account
          timeline is not yet indexed.
        </p>
      )}
      {!q.data?.walletLinked && wallet.address && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void linkWallet()}
          className="min-h-11 rounded-full border border-primary/40 px-5 text-sm text-primary disabled:opacity-40"
        >
          Verify connected wallet ownership
        </button>
      )}
      {notice && (
        <p role="status" className="break-all text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </div>
  );
}
