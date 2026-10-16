import { useQuery } from "@tanstack/react-query";
import { nativeActivityOptions } from "@/lib/protocol/read.functions";
import type { NativeMarket } from "@/lib/protocol/types";
import { usdcShort, sharesShort } from "@/lib/protocol/display.mjs";
export function NativeMarketTerms({ market }: { market: NativeMarket }) {
  return (
    <details className="mt-5 rounded-2xl border border-border bg-card/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        On-chain identity &amp; resolution
      </summary>
      <dl className="mt-4 space-y-3 text-xs">
        {[
          ["Market", `${market.marketId} · ${market.status}`],
          ["Chain", `${market.chainId} · native USDC`],
          ["Question ID", market.questionId],
          ["Condition ID", market.conditionId],
          ["Oracle", market.oracle],
          ["Resolution source", market.source],
          ["Closes", new Date(market.closeAt).toUTCString()],
          ["Resolve after", new Date(market.resolveAfter).toUTCString()],
          ["Timeout", new Date(market.resolutionDeadline).toUTCString()],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-all font-mono">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Rules and source hashes are locked on-chain. Proposals may be challenged before
        finalization. Timeout void payouts go to current share holders; they are not a guarantee of
        the original trading price.
      </p>
    </details>
  );
}
export function NativeActivity({ marketId }: { marketId: string }) {
  const q = useQuery(nativeActivityOptions(marketId));
  return (
    <section className="mt-7" aria-label="Market activity">
      <h2 className="text-xl font-semibold">Activity</h2>
      {q.isError ? (
        <p className="mt-4 text-sm text-muted-foreground">Activity temporarily unavailable.</p>
      ) : !q.data?.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {q.isPending ? "Loading finalized trades…" : "No finalized TacPredict trades yet."}
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {q.data.map((t) => (
            <a
              key={t.txHash + t.timestamp + t.outcome}
              href={`https://${t.chainId === 84532 ? "sepolia." : ""}basescan.org/tx/${t.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block py-3 text-sm"
            >
              <div className="flex justify-between gap-3">
                <span>
                  {t.outcome} · {sharesShort(t.sharesAtomic)} shares
                </span>
                <span>{usdcShort(t.usdcAtomic)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(t.timestamp).toLocaleString()} · View transaction ↗
              </p>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
