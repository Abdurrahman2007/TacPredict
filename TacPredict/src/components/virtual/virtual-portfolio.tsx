import type { VirtualDeployment } from "@/lib/virtual/types";
import { useVirtualAccount, virtualMoney } from "@/lib/virtual/hooks";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useState } from "react";
import { createPublicClient, createWalletClient, custom, defineChain } from "viem";
import { base, baseSepolia } from "viem/chains";
import { virtualAmmAbi } from "@/lib/virtual/abi";
import type { Market } from "@/domain/markets/types";
export function VirtualPortfolio({
  deployment,
  tab,
  marketId,
  markets = [],
  search = "",
}: {
  deployment: VirtualDeployment;
  tab: string;
  marketId?: string | undefined;
  markets?: Market[];
  search?: string;
}) {
  const q = useVirtualAccount(deployment),
    w = useBaseWallet();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.isError)
    return <p role="alert">Virtual account data unavailable. No estimate is substituted.</p>;
  if (!q.data)
    return (
      <p>
        {w.address
          ? "Loading verified virtual positions…"
          : "Connect your wallet to view virtual positions."}
      </p>
    );
  const match = (id: string) => {
    const title = markets.find((m) => m.virtual?.onchainId === id)?.title ?? `Market ${id}`;
    return title.toLowerCase().includes(search.toLowerCase());
  };
  async function settle(id: string) {
    if (busy || !w.provider || !w.address || w.chainId !== deployment.chainId) return;
    setBusy(true);
    try {
      const chain =
        deployment.chainId === 8453
          ? base
          : deployment.chainId === 84532
            ? baseSepolia
            : defineChain({
                id: 31337,
                name: "Local test",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: { default: { http: [] } },
              });
      const pub = createPublicClient({ chain, transport: custom(w.provider) }),
        wallet = createWalletClient({ chain, transport: custom(w.provider) });
      const code = await pub.getBytecode({ address: deployment.engine });
      const { keccak256 } = await import("viem");
      if (
        (await pub.getChainId()) !== deployment.chainId ||
        !code ||
        keccak256(code).toLowerCase() !== deployment.codeHash.toLowerCase()
      )
        throw Error("Virtual deployment mismatch");
      const { request } = await pub.simulateContract({
        account: w.address as `0x${string}`,
        address: deployment.engine,
        abi: virtualAmmAbi,
        functionName: "settleFor",
        args: [BigInt(id), w.address as `0x${string}`],
      });
      const hash = await wallet.writeContract(request),
        receipt = await pub.waitForTransactionReceipt({ hash });
      const { decodeVirtualEvents } = await import("@/lib/virtual/receipt");
      const events = decodeVirtualEvents(receipt, deployment.engine);
      if (
        !events.some(
          (e) =>
            e.name === "PositionSettled" &&
            e.wallet === w.address!.toLowerCase() &&
            e.marketId === id,
        )
      )
        throw Error("Settlement event missing");
      setNotice(`Virtual settlement confirmed: ${hash}. Waiting for indexer.`);
      await q.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Settlement failed");
    } finally {
      setBusy(false);
    }
  }
  const rows = q.data.positions.filter(
    (p) => BigInt(p.shares) > 0n && (!marketId || p.marketId === marketId) && match(p.marketId),
  );
  return (
    <>
      {tab === "Orders" || tab === "Open" ? (
        <p>No resting orders. Virtual trades execute atomically.</p>
      ) : tab === "History" || tab === "Activity" ? (
        <>
          {q.data.trades
            .filter((t) => (!marketId || t.marketId === marketId) && match(t.marketId!))
            .slice()
            .reverse()
            .map((t) => (
              <div className="pd-position-row" key={`${t.txHash}:${t.logIndex}`}>
                <span>
                  {t.args["isBuy"] ? "Buy" : "Sell"} · Market {t.marketId}
                </span>
                <strong>
                  {virtualMoney(String(t.args["input"]))}{" "}
                  {t.args["isBuy"] ? "Virtual USDC" : "shares"}
                </strong>
              </div>
            ))}
          {!q.data.trades.length && <p>No confirmed activity</p>}
        </>
      ) : (
        <>
          {rows.map((p) => (
            <div className="pd-position-row" key={`${p.marketId}:${p.outcome}`}>
              <span>
                {markets.find((m) => m.virtual?.onchainId === p.marketId)?.title ??
                  `Market ${p.marketId}`}{" "}
                · Outcome {p.outcome + 1}
                <br />
                {virtualMoney(p.shares)} shares · Basis {virtualMoney(p.basis)} Virtual USDC
              </span>
              <button type="button" disabled={busy} onClick={() => void settle(p.marketId)}>
                Settle if final
              </button>
            </div>
          ))}
          {!rows.length && <p>No positions</p>}
        </>
      )}
      <p className="pd-order-note">
        Virtual USDC · Indexed block {q.data.blockNumber} · Finalized through{" "}
        {q.data.finalizedBlock}. Not withdrawable.
      </p>
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
