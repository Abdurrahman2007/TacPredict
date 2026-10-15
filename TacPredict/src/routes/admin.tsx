import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminGate } from "@/components/admin/admin-gate";
import adminCss from "@/styles/admin.css?url";

/**
 * Layout for the separate administrator workspace. Everything below /admin (except /admin/login)
 * is gated by: signed-in session -> database admin role -> authenticator (AAL2).
 */
export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "TacPredict Admin" }, { name: "robots", content: "noindex, nofollow" }],
    links: [{ rel: "stylesheet", href: adminCss }],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <AdminGate>
      {(user) => (
        <AdminShell user={user}>
          <Outlet />
        </AdminShell>
      )}
    </AdminGate>
  );
}
