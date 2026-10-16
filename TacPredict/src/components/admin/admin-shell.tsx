import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import {
  adminNavItems,
  defaultViews,
  isAdminRouteSection,
  type AdminNavItem,
} from "@/lib/protocol/admin-nav";

/** Centered white card used by sign-in, verification and access-denied screens. */
export function AdminCenter({ children }: { children: ReactNode }) {
  return (
    <div className="adm-root">
      <div className="adm-login">{children}</div>
    </div>
  );
}

function useActiveNav() {
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const search = location.search as Record<string, unknown>;
  const segments = pathname.split("/");
  const section = segments[2] ?? "";
  const view = typeof search["view"] === "string" ? (search["view"] as string) : undefined;
  const isActive = (item: AdminNavItem) => {
    if (item.kind === "overview") return pathname === "/admin";
    if (item.kind === "importer") return pathname.startsWith("/admin/market-importer");
    if (!isAdminRouteSection(section) || section !== item.section) return false;
    // "Create market" is its own entry; every other Markets tab belongs to "Markets".
    const current = view ?? defaultViews[item.section];
    return item.id === "create" ? current === "create" : item.id === "markets" ? current !== "create" : true;
  };
  return { pathname, isActive };
}

export function AdminShell({ user, children }: { user: User; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname, isActive } = useActiveNav();
  const close = () => setOpen(false);
  const activeItem = adminNavItems.find((item) => isActive(item));
  const title = activeItem?.label ?? "Administration";
  const email = user.email ?? "Administrator";

  async function leave(scope: "local" | "global") {
    await supabase.auth.signOut({ scope });
    void navigate({ to: "/admin/login" });
  }

  return (
    <div className="adm-root">
      <div className="adm-app">
        <aside className="adm-side" data-open={open} aria-label="Administrator navigation">
          <div className="adm-brand">
            <div className="adm-brand-mark" aria-hidden="true">
              TP
            </div>
            <div>
              <b>TacPredict</b>
              <small>Admin</small>
            </div>
          </div>

          <nav aria-label="Pages">
            {adminNavItems.map((item) => {
              const active = isActive(item);
              if (item.kind === "overview")
                return (
                  <Link key={item.id} to="/admin" className="adm-nav-item" data-active={active} onClick={close}>
                    {item.label}
                  </Link>
                );
              if (item.kind === "importer")
                return (
                  <Link
                    key={item.id}
                    to="/admin/market-importer"
                    className="adm-nav-item"
                    data-active={active}
                    onClick={close}
                  >
                    {item.label}
                  </Link>
                );
              return (
                <Link
                  key={item.id}
                  to="/admin/$section"
                  params={{ section: item.section }}
                  search={{ view: item.view }}
                  className="adm-nav-item"
                  data-active={active}
                  onClick={close}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="adm-scrim" data-open={open} onClick={close} aria-hidden="true" />

        <div className="adm-main">
          <header className="adm-top">
            <button
              type="button"
              className="adm-btn adm-menu-btn"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu size={18} />
            </button>
            <span className="adm-top-title">{title}</span>
            <span className="adm-top-spacer" />
            <WalletConnectButton className="adm-wallet" />
            <details className="adm-menu">
              <summary className="adm-avatar" aria-label="Account menu">
                {email.slice(0, 1).toUpperCase()}
              </summary>
              <div className="adm-menu-panel">
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontWeight: 650, overflowWrap: "anywhere" }}>{email}</div>
                  <div className="adm-muted" style={{ fontSize: 12 }}>
                    Authenticator verified (AAL2)
                  </div>
                </div>
                <button type="button" onClick={() => void leave("local")}>
                  Sign out
                </button>
                <button type="button" onClick={() => void leave("global")}>
                  Sign out of all devices
                </button>
                <Link to="/" className="adm-nav-item" style={{ minHeight: 0 }}>
                  Open public site
                </Link>
              </div>
            </details>
          </header>
          <main className="adm-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
