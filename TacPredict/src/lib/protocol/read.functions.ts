import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { signedOrderSchema } from "./orders";
import { validPublicMarketId } from "./market-identity.mjs";
const marketId = z.string().refine(validPublicMarketId, "Invalid chain-aware market ID");
export const getNativeActivity = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => z.object({ marketId }).parse(v))
  .handler(async ({ data }) => {
    const { readProtocolRpc } = await import("./read.server");
    return z
      .array(
        z.object({
          txHash: z.string(),
          chainId: z.number(),
          outcome: z.string(),
          priceAtomic: z.string(),
          sharesAtomic: z.string(),
          usdcAtomic: z.string(),
          timestamp: z.string(),
        }),
      )
      .parse(await readProtocolRpc("get_protocol_market_activity", { _market_id: data.marketId }));
  });
export const orderBookSchema = z.array(
  z.object({
    orderId: z.string(),
    order: signedOrderSchema,
    signature: z.string(),
    remainingAtomic: z.string().regex(/^\d+$/),
  }),
);
export type BookOrder = z.infer<typeof orderBookSchema>[number];
export const getNativeOrderbook = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) =>
    z.object({ marketId, outcome: z.number().int().min(0).max(7) }).parse(v),
  )
  .handler(async ({ data }) => {
    const { readProtocolRpc } = await import("./read.server");
    return orderBookSchema.parse(
      await readProtocolRpc("get_protocol_signed_orderbook", {
        _market_id: data.marketId,
        _outcome: String(data.outcome),
      }),
    );
  });
export const nativeActivityOptions = (marketId: string) =>
  queryOptions({
    queryKey: ["native-activity", marketId],
    queryFn: () => getNativeActivity({ data: { marketId } }),
    staleTime: 30000,
    refetchInterval: 30000,
  });
export const nativeOrderbookOptions = (marketId: string, outcome: number) =>
  queryOptions({
    queryKey: ["native-book", marketId, outcome],
    queryFn: () => getNativeOrderbook({ data: { marketId, outcome } }),
    staleTime: 10000,
    refetchInterval: 15000,
  });
