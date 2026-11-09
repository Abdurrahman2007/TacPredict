import { createFileRoute } from "@tanstack/react-router";
import { farcasterManifest } from "@/lib/farcaster/manifest";

export const Route = createFileRoute("/.well-known/farcaster.json")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(farcasterManifest, {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
