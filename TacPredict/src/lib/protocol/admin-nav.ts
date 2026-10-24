/**
 * Navigation for the separate administrator workspace (/admin).
 * Kept deliberately short: one sidebar entry per job, with sub-pages as tabs inside the page.
 * Only pages that show real data or do real work are listed.
 */
export const adminRouteSections = [
  "virtual",
  "markets",
  "pool",
  "engine",
  "trading",
  "resolution",
  "users",
  "ranking",
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
  { kind: "page", id: "virtual", label: "Virtual Trading", section: "virtual", view: "overview" },
  { kind: "overview", id: "overview", label: "Overview" },
  { kind: "page", id: "markets", label: "Markets", section: "markets", view: "all" },
  { kind: "page", id: "create", label: "Create Market", section: "markets", view: "create" },
  { kind: "page", id: "pool", label: "Up/Down Pool", section: "pool", view: "status" },
  { kind: "page", id: "users", label: "Users", section: "users", view: "users" },
  { kind: "page", id: "settings", label: "Settings", section: "settings", view: "system" },
];

/** First view of every section; used when the URL has no `view`. */
export const defaultViews: Record<AdminRouteSection, string> = {
  virtual: "overview",
  markets: "all",
  pool: "status",
  engine: "fixtures",
  trading: "trades",
  resolution: "pending",
  users: "users",
  ranking: "overview",
  blockchain: "contracts",
  treasury: "usdc",
  analytics: "overview",
  notifications: "overview",
  settings: "system",
};

/** Tabs shown at the top of a section page. Sections without tabs are single pages. */
export const sectionTabs: Partial<Record<AdminRouteSection, { view: string; label: string }[]>> = {
  users: [
    { view: "users", label: "Users" },
    { view: "referrals", label: "Referrals" },
  ],
  pool: [
    { view: "status", label: "Status" },
    { view: "series", label: "Series" },
    { view: "rounds", label: "Rounds & refunds" },
    { view: "setup", label: "Setup" },
  ],
  engine: [
    { view: "public", label: "Home & Markets" },
    { view: "fixtures", label: "Football & Cricket" },
    { view: "crypto", label: "Crypto Up/Down" },
    { view: "providers", label: "Providers" },
  ],
  resolution: [
    { view: "pending", label: "Pending" },
    { view: "crypto", label: "Crypto oracle" },
    { view: "sports", label: "Sports results" },
    { view: "disputes", label: "Disputes" },
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
  ],
};

/** Old links to pages that were merged or removed land somewhere useful instead of an empty page. */
export function adminRedirectFor(
  section: AdminRouteSection,
  view: string,
): "overview" | "users" | "engine" | null {
  if (section === "treasury" || section === "analytics" || section === "notifications")
    return "overview";
  if (section === "settings" && view === "admins") return "users";
  if (section === "settings" && (view === "categories" || view === "providers")) return "engine";
  if (section === "resolution" && view === "evidence") return "overview";
  return null;
}
