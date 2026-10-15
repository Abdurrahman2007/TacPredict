import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminLoginForm, useAdminGate, adminSignOut } from "@/components/admin/admin-gate";
import { AdminCenter } from "@/components/admin/admin-shell";
import { AdminMfa } from "@/components/admin-mfa";
import { AdminNoRole, AdminSplash } from "@/components/admin/admin-login";
import adminCss from "@/styles/admin.css?url";

export const Route = createFileRoute("/admin_/login")({
  head: () => ({
    meta: [{ title: "TacPredict Admin sign in" }, { name: "robots", content: "noindex, nofollow" }],
    links: [{ rel: "stylesheet", href: adminCss }],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const gate = useAdminGate();
  const navigate = useNavigate();
  useEffect(() => {
    if (gate.state === "ready") void navigate({ to: "/admin" });
  }, [gate.state, navigate]);

  switch (gate.state) {
    case "signed-out":
      return <AdminLoginForm />;
    case "no-role":
      return (
        <AdminNoRole email={gate.user.email ?? gate.user.id} onSignOut={() => void adminSignOut()} />
      );
    case "mfa":
      return (
        <AdminCenter>
          <div style={{ width: "100%", maxWidth: 440 }}>
            <AdminMfa onVerified={gate.verified} />
          </div>
        </AdminCenter>
      );
    case "error":
      return (
        <AdminCenter>
          <div className="adm-login-card">
            <h1>Could not verify access</h1>
            <p className="adm-sub">The administrator check failed. Nothing was opened.</p>
            <button type="button" className="adm-btn adm-btn-primary" onClick={gate.retry}>
              Try again
            </button>
            <button type="button" className="adm-btn" onClick={() => void adminSignOut()}>
              Sign out
            </button>
          </div>
        </AdminCenter>
      );
    default:
      return <AdminSplash text="Checking administrator session…" />;
  }
}
