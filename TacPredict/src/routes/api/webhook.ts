import { createFileRoute } from "@tanstack/react-router";

/**
 * Farcaster Mini App webhook — accepts notification lifecycle events.
 * Returns `{ success: true }` so domain / embed tooling can complete.
 */
export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { success: true, service: "tacpredict-farcaster-webhook" },
          { headers: { "Cache-Control": "no-store" } },
        ),
      POST: async () =>
        Response.json(
          { success: true },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
