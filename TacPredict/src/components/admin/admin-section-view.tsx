import type { AdminRouteSection } from "@/lib/protocol/admin-nav";
import { AnalyticsView, NotificationsView } from "./views/analytics";
import { BlockchainView } from "./views/blockchain";
import { MarketsView } from "./views/markets";
import { ResolutionView } from "./views/resolution";
import { SettingsView } from "./views/settings";
import { TradingView } from "./views/trading";
import { TreasuryView } from "./views/treasury";
import { UsersView } from "./views/users";

/** Maps /admin/$section?view= to the page for that section. */
export function AdminSectionView({ section, view }: { section: AdminRouteSection; view: string }) {
  switch (section) {
    case "markets":
      return <MarketsView view={view} />;
    case "trading":
      return <TradingView view={view} />;
    case "resolution":
      return <ResolutionView view={view} />;
    case "users":
      return <UsersView view={view} />;
    case "blockchain":
      return <BlockchainView view={view} />;
    case "treasury":
      return <TreasuryView view={view} />;
    case "analytics":
      return <AnalyticsView />;
    case "notifications":
      return <NotificationsView />;
    case "settings":
      return <SettingsView view={view} />;
  }
}
