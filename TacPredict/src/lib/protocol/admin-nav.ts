/**
 * Navigation for the separate administrator workspace (/admin).
 * Kept deliberately short: one sidebar entry per job, with sub-pages as tabs inside the page.
 * Only pages that show real data or do real work are listed.
 */
export const adminRouteSections = [
  "markets",
  "trading",
  "resolution",
  "users",
  "blockchain",
  "treasury",
  "analytics",
  "notifications",
  "settings",
] as const;
export type AdminRouteSection = (typeof adminRouteSections)[number];

export function isAdminRouteSection(value: string): value is AdminRouteSection {
  return (adminRouteSections as readonly string[]).includes(value);
}

export type AdminNavItem =
  | { kind: "overview"; id: string; label: string }
  | { kind: "page"; id: string; label: string; section: AdminRouteSection; view: string }
  | { kind: "importer"; id: string; label: string };

export const adminNavItems: AdminNavItem[] = [
  { kind: "overview", id: "overview", label: "Overview" },
  { kind: "page", id: "markets", label: "Markets", section: "markets", view: "all" },
  { kind: "page", id: "create", label: "Create market", section: "markets", view: "create" },
  { kind: "importer", id: "importer", label: "AI importer" },
  { kind: "page", id: "resolution", label: "Resolution", section: "resolution", view: "pending" },
  { kind: "page", id: "trades", label: "Trades", section: "trading", view: "trades" },
  { kind: "page", id: "users", label: "Users", section: "users", view: "users" },
  { kind: "page", id: "blockchain", label: "Blockchain", section: "blockchain", view: "contracts" },
  { kind: "page", id: "settings", label: "Settings", section: "settings", view: "system" },
];

/** First view of every section; used when the URL has no `view`. */
export const defaultViews: Record<AdminRouteSection, string> = {
  markets: "all",
  trading: "trades",
  resolution: "pending",
  users: "users",
  blockchain: "contracts",
  treasury: "usdc",
  analytics: "overview",
  notifications: "overview",
  settings: "system",
};

/** Tabs shown at the top of a section page. Sections without tabs are single pages. */
export const sectionTabs: Partial<Record<AdminRouteSection, { view: string; label: string }[]>> = {
  markets: [
    { view: "all", label: "All" },
    { view: "live", label: "Live" },
    { view: "upcoming", label: "Upcoming" },
    { view: "closed", label: "Closed" },
    { view: "resolving", label: "Resolving" },
    { view: "resolved", label: "Resolved" },
  ],
  resolution: [
    { view: "pending", label: "Pending" },
    { view: "disputes", label: "Disputes" },
    { view: "evidence", label: "Evidence" },
    { view: "resolve", label: "Resolve" },
  ],
  blockchain: [
    { view: "contracts", label: "Contracts" },
    { view: "oracle", label: "Oracle" },
    { view: "indexer", label: "Indexer" },
  ],
  settings: [
    { view: "system", label: "System" },
    { view: "audit", label: "Audit log" },
    { view: "categories", label: "Categories" },
    { view: "providers", label: "Providers" },
  ],
};

/** Old links to pages that were merged or removed land somewhere useful instead of an empty page. */
export function adminRedirectFor(section: AdminRouteSection, view: string): "overview" | "users" | null {
  if (section === "treasury" || section === "analytics" || section === "notifications") return "overview";
  if (section === "settings" && view === "admins") return "users";
  return null;
}
