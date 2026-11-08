import { createFileRoute } from "@tanstack/react-router";

/** Called once a minute by Supabase (pg_cron) with the trigger secret. Does one bounded keeper pass. */
export const Route = createFileRoute("/api/v2/keeper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateKeeperTrigger } = await import("@/lib/virtual-set/trigger.server");
        const denied = await authenticateKeeperTrigger(request);
        if (denied) return denied;
        const { keeperTick } = await import("@/lib/virtual-set/keeper.server");
        const report = await keeperTick();
        return Response.json(report, {
          status: report.ok || report.skipped ? 200 : 500,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
