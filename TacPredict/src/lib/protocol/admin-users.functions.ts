import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Administrator user control. Every call re-checks session, authenticator (AAL2) and the assigned
 * admin role on the server before the service-role client is touched. Balances and positions are
 * Base contract truth and are intentionally not editable here.
 */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const server = await import("./admin-users.server");
    await server.requireAdmin(
      context.supabase as unknown as SupabaseClient,
      context.userId,
      context.claims.aal,
    );
    return { ...(await server.loadUsers()), actorId: context.userId };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ userId: z.string().uuid(), suspended: z.boolean() }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    const server = await import("./admin-users.server");
    await server.requireAdmin(
      context.supabase as unknown as SupabaseClient,
      context.userId,
      context.claims.aal,
    );
    await server.changeSuspension(context.userId, data.userId, data.suspended);
    return { ok: true as const };
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ userId: z.string().uuid(), admin: z.boolean() }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    const server = await import("./admin-users.server");
    await server.requireAdmin(
      context.supabase as unknown as SupabaseClient,
      context.userId,
      context.claims.aal,
    );
    await server.changeAdminRole(context.userId, data.userId, data.admin);
    return { ok: true as const };
  });

export const adminUsersQueryOptions = queryOptions({
  queryKey: ["admin-users"],
  queryFn: () => listAdminUsers(),
  retry: 0,
  staleTime: 15_000,
});
