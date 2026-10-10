import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/protocol/metadata/$hash")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!/^0x[0-9a-f]{64}$/.test(params.hash))
          return new Response("Not found", { status: 404 });
        try {
          const { readProtocolRpc } = await import("@/lib/protocol/read.server");
          const data = await readProtocolRpc("get_protocol_metadata", { _hash: params.hash });
          if (!data) return new Response("Not found", { status: 404 });
          return Response.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
        } catch {
          return new Response("Metadata unavailable", { status: 503 });
        }
      },
    },
  },
});
