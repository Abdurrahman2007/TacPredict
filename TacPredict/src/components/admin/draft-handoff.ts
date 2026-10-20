import type { Draft } from "@/lib/protocol/market-templates.mjs";

/**
 * Carries a market-engine draft from the Market engine page to Create market. It lives only in
 * memory for the current browser tab: nothing is saved and nothing is published by handing it over.
 */
let pending: Draft | null = null;
export function handOffDraft(draft: Draft) {
  pending = draft;
}
export function takeDraft(): Draft | null {
  const draft = pending;
  pending = null;
  return draft;
}
/** True when a draft is waiting, without taking it. Lets Create market open on the right tab. */
export function hasDraft(): boolean {
  return pending !== null;
}
