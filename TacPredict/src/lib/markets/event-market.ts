import type { Market } from "@/domain/markets/types";
import type { EventDraft } from "@/lib/agent/events.functions";
export function eventMarket(p: EventDraft): Market {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    closesAt: new Date(p.closeAt).toISOString().slice(0, 16).replace("T", " ") + " UTC",
    endsAt: p.closeAt,
    volume: "$0",
    participants: 0,
    outcomes: p.outcomes.map((label, i) => ({
      id: String(i),
      label,
      probability: 0,
      probabilityKnown: false,
    })),
    description:
      "Source event discovered by the backend importer. Not a listed TacPredict on-chain market.",
    source: p.source,
    sourceUrl: p.sourceUrl,
    resolutionCriteria:
      "Independent TacPredict terms, source approval and on-chain publication are required.",
  };
}
