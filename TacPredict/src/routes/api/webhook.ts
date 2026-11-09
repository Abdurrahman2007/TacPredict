import { createFileRoute } from "@tanstack/react-router";

/**
 * Farcaster Mini App webhook endpoint.
 * Accepts event POSTs so domain association / frame setup can complete; expand handlers later.
 */
export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          { ok: true, service: "tacpredict-farcaster-webhook" },
          { headers: { "Cache-Control": "no-store" } },
        ),
      POST: async () =>
        Response.json(
          { ok: true },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        ),
    },
  },
});
