import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { AdminMfa } from "@/components/admin-mfa";
import { supabase } from "@/integrations/supabase/client";
import { getProtocolAdminAccess } from "@/lib/protocol/admin.functions";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { AdminLoginForm, AdminNoRole, AdminSplash } from "./admin-login";
import { AdminCenter } from "./admin-shell";

export type AdminGateState =
  | { state: "checking" }
  | { state: "signed-out" }
  | { state: "error"; retry: () => void }
  | { state: "no-role"; user: User }
  | { state: "mfa"; user: User; verified: () => void }
  | { state: "ready"; user: User };

/** Session -> assigned admin role -> authenticator (AAL2). Mirrors the server and database checks. */
export function useAdminGate(): AdminGateState {
  const { user, ready } = useProtocolUser();
  const access = useQuery({
    queryKey: ["protocol-admin", user?.id],
    enabled: !!user,
    queryFn: () => getProtocolAdminAccess(),
    retry: 0,
  });
  if (!ready) return { state: "checking" };
  if (!user) return { state: "signed-out" };
  if (access.isPending) return { state: "checking" };
  if (access.isError) return { state: "error", retry: () => void access.refetch() };
  if (!access.data.allowed) return { state: "no-role", user };
  if (access.data.mfaRequired) return { state: "mfa", user, verified: () => void access.refetch() };
  return { state: "ready", user };
}

export async function adminSignOut() {
  await supabase.auth.signOut();
}

/** Protects every /admin page: unauthenticated visitors are sent to /admin/login. */
export function AdminGate({ children }: { children: (user: User) => ReactNode }) {
  const gate = useAdminGate();
  const navigate = useNavigate();
  useEffect(() => {
    if (gate.state === "signed-out") void navigate({ to: "/admin/login" });
  }, [gate.state, navigate]);

  switch (gate.state) {
    case "checking":
    case "signed-out":
      return <AdminSplash text="Checking administrator session…" />;
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
    case "no-role":
      return (
        <AdminNoRole
          email={gate.user.email ?? gate.user.id}
          onSignOut={() => void adminSignOut()}
        />
      );
    case "mfa":
      return (
        <AdminCenter>
          <div style={{ width: "100%", maxWidth: 440 }}>
            <AdminMfa onVerified={gate.verified} />
          </div>
        </AdminCenter>
      );
    case "ready":
      return <>{children(gate.user)}</>;
  }
}

export { AdminLoginForm };
