import { createFileRoute } from "@tanstack/react-router";

/**
 * The public metadata of one on-chain window market. `metadata` is exactly the document whose keccak256 hash the
 * market stores on chain; `market` is the current state (price to beat, result, transactions).
 */
export const Route = createFileRoute("/api/v2/market/$key")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { parseMarketKey } = await import("@/lib/virtual-set/schedule.mjs");
        if (!parseMarketKey(params.key)) return new Response("Not found", { status: 404 });
        const { marketMetadata } = await import("@/lib/virtual-set/market-terms.mjs");
        const metadata = marketMetadata(params.key);
        let market: Record<string, unknown> | null = null;
        try {
          const { vdb, marketByKey } = await import("@/lib/virtual-set/db.server");
          const row = await marketByKey(await vdb(), params.key);
          if (row)
            market = {
              marketId: row.market_id,
              strike: row.strike,
              endPrice: row.end_price,
              outcome: row.outcome === null ? null : row.outcome === 0 ? "Up" : "Down",
              voided: row.voided,
              resolved: row.resolved,
              createTx: row.create_tx,
              proposeTx: row.propose_tx,
              finalizeTx: row.finalize_tx,
            };
        } catch {
          market = null;
        }
        return Response.json({ metadata, market }, { headers: { "Cache-Control": "public, max-age=15" } });
      },
    },
  },
});
