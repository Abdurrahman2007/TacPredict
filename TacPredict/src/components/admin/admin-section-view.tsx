import { Link, Navigate } from "@tanstack/react-router";
import { adminRedirectFor, sectionTabs, type AdminRouteSection } from "@/lib/protocol/admin-nav";
import { BlockchainView } from "./views/blockchain";
import { EngineView } from "./views/engine";
import { MarketsView } from "./views/markets";
import { PoolView } from "./views/pool";
import { ResolutionView } from "./views/resolution";
import { SettingsView } from "./views/settings";
import { TradingView } from "./views/trading";
import { RankingView } from "./views/ranking";
import { UsersView } from "./views/users";

function SectionTabs({ section, view }: { section: AdminRouteSection; view: string }) {
  const tabs = sectionTabs[section];
  if (!tabs || !tabs.some((t) => t.view === view)) return null;
  return (
    <nav className="adm-tabs" aria-label="Page sections">
      {tabs.map((t) => (
        <Link
          key={t.view}
          to="/admin/$section"
          params={{ section }}
          search={{ view: t.view }}
          className="adm-tab"
          aria-current={t.view === view ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

function SectionBody({ section, view }: { section: AdminRouteSection; view: string }) {
  switch (section) {
    case "markets":
      return <MarketsView view={view} />;
    case "pool":
      return <PoolView view={view} />;
    case "engine":
      return <EngineView view={view} />;
    case "resolution":
      return <ResolutionView view={view} />;
    case "blockchain":
      return <BlockchainView view={view} />;
    case "settings":
      return <SettingsView view={view} />;
    case "ranking":
      return <RankingView />;
    case "users":
      return <UsersView view={view} />;
    default:
      return <TradingView view={view} />;
  }
}

/** Maps /admin/$section?view= to the page for that section. */
export function AdminSectionView({ section, view }: { section: AdminRouteSection; view: string }) {
  const redirect = adminRedirectFor(section, view);
  if (redirect === "overview") return <Navigate to="/admin" replace />;
  if (redirect === "engine")
    return (
      <Navigate
        to="/admin/$section"
        params={{ section: "engine" }}
        search={{ view: "providers" }}
        replace
      />
    );
  if (redirect === "users")
    return (
      <Navigate
        to="/admin/$section"
        params={{ section: "users" }}
        search={{ view: "users" }}
        replace
      />
    );
  return (
    <div className="adm-stack">
      <SectionTabs section={section} view={view} />
      <SectionBody section={section} view={view} />
    </div>
  );
}
