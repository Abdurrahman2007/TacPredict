import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
export const eventDraftSchema = z.object({
  id: z.string().startsWith("event-"),
  title: z.string().min(5).max(200),
  category: z.enum(["Crypto", "Sports", "News", "Technology", "Business", "Culture"]),
  outcomes: z.array(z.string()).min(2).max(8),
  closeAt: z.string(),
  sourceUrl: z.string().url(),
  status: z.literal("DISCOVERED"),
  source: z.literal("Polymarket Gamma"),
  updatedAt: z.string(),
});
export type EventDraft = z.infer<typeof eventDraftSchema>;
export const getEventDrafts = createServerFn({ method: "GET" }).handler(async () => {
  const { readProtocolRpc } = await import("@/lib/protocol/read.server");
  return z
    .array(eventDraftSchema)
    .max(30)
    .parse(await readProtocolRpc("get_market_event_drafts"));
});
export const eventDraftsQueryOptions = queryOptions({
  queryKey: ["market-event-drafts", "v1"],
  queryFn: () => getEventDrafts(),
  staleTime: 60000,
  gcTime: 1800000,
  refetchInterval: 60000,
  retry: 0,
  refetchOnWindowFocus: false,
});
