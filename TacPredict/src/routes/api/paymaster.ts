import { createFileRoute } from "@tanstack/react-router";

/**
 * JSON-RPC proxy for Coinbase / EIP-5792 paymasterService → Pimlico Base (8453).
 * Keeps the Pimlico API key on the server. Fund / allowlist contracts in the Pimlico dashboard.
 */
const DEFAULT_PIMLICO =
  "https://api.pimlico.io/v2/8453/rpc?apikey=pim_5E5142r4Q1eGyKox9n7as4";

function upstreamUrl(): string {
  const fromEnv =
    (typeof process !== "undefined" &&
      (process.env["PIMLICO_RPC_URL"] || process.env["PIMLICO_PAYMASTER_URL"])) ||
    "";
  return typeof fromEnv === "string" && fromEnv.startsWith("http") ? fromEnv : DEFAULT_PIMLICO;
}

export const Route = createFileRoute("/api/paymaster")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
            "Access-Control-Max-Age": "86400",
          },
        }),
      POST: async ({ request }) => {
        let body: string;
        try {
          body = await request.text();
          JSON.parse(body);
        } catch {
          return Response.json(
            { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
            { status: 400 },
          );
        }
        try {
          const upstream = await fetch(upstreamUrl(), {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body,
          });
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: {
              "content-type": upstream.headers.get("content-type") || "application/json",
              "cache-control": "no-store",
              "access-control-allow-origin": "*",
            },
          });
        } catch (error) {
          return Response.json(
            {
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32000,
                message: error instanceof Error ? error.message : "Paymaster unavailable",
              },
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
