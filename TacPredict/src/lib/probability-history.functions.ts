import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
export type ProbabilityHistory = {
  series: { label: string; points: { time: number; probability: number }[] }[];
  source: "TacPredict";
  updatedAt: string;
  unavailable?: boolean;
};
const schema = z.object({
  marketId: z.string().regex(/^TACP-\d+-\d+$/),
  interval: z.enum(["1h", "1d", "1w", "1m"]),
});
export const getProbabilityHistory = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => schema.parse(v))
  .handler(async ({ data }): Promise<ProbabilityHistory> => {
    const updatedAt = new Date().toISOString();
    try {
      const { readProtocolRpc } = await import("./protocol/read.server");
      const hours = { "1h": 1, "1d": 24, "1w": 168, "1m": 720 }[data.interval];
      const series = z
        .array(
          z.object({
            label: z.string(),
            points: z.array(
              z.object({ time: z.number(), probability: z.number().min(0).max(100) }),
            ),
          }),
        )
        .parse(
          await readProtocolRpc("get_protocol_probability_history", {
            _market_id: data.marketId,
            _since: new Date(Date.now() - hours * 3600000).toISOString(),
          }),
        );
      return {
        series,
        source: "TacPredict",
        updatedAt,
        unavailable: !series.some((s) => s.points.length > 1),
      };
    } catch {
      return { series: [], source: "TacPredict", updatedAt, unavailable: true };
    }
  });
export const probabilityHistoryOptions = (marketId: string, interval: "1h" | "1d" | "1w" | "1m") =>
  queryOptions({
    queryKey: ["native-probability-history", marketId, interval],
    queryFn: () => getProbabilityHistory({ data: { marketId, interval } }),
    staleTime: 30000,
    retry: 0,
    refetchInterval: 30000,
  });
