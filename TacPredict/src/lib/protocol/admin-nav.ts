/**
 * Navigation for the separate administrator workspace (/admin).
 * `capability` is honest about what each page can do today:
 *  - "live":    shows real indexed / on-chain data
 *  - "wallet":  real data plus wallet-signed on-chain actions
 *  - "off":     no backend read/write exists yet; the page explains what is missing
 */
export type AdminCapability = "live" | "wallet" | "off";

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
  | { kind: "page"; id: string; label: string; section: AdminRouteSection; view: string; capability: AdminCapability }
  | { kind: "importer"; id: string; label: string; capability: AdminCapability };

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

const page = (
  section: AdminRouteSection,
  view: string,
  label: string,
  capability: AdminCapability,
): AdminNavItem => ({ kind: "page", id: `${section}:${view}`, label, section, view, capability });

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: "Markets",
    items: [
      page("markets", "all", "All markets", "live"),
      page("markets", "create", "Create market", "wallet"),
      page("markets", "live", "Live", "live"),
      page("markets", "upcoming", "Upcoming", "live"),
      page("markets", "closed", "Closed", "live"),
      page("markets", "resolving", "Resolving", "live"),
      page("markets", "resolved", "Resolved", "live"),
      { kind: "importer", id: "importer", label: "AI market importer", capability: "live" },
    ],
  },
  {
    title: "Trading",
    items: [
      page("trading", "orders", "Orders", "off"),
      page("trading", "trades", "Trades", "live"),
      page("trading", "positions", "Positions", "off"),
      page("trading", "liquidity", "Liquidity", "off"),
    ],
  },
  {
    title: "Resolution",
    items: [
      page("resolution", "pending", "Pending", "live"),
      page("resolution", "resolve", "Resolve", "wallet"),
      page("resolution", "disputes", "Disputes", "live"),
      page("resolution", "evidence", "Evidence", "live"),
    ],
  },
  {
    title: "Users",
    items: [
      page("users", "users", "Users", "live"),
      page("users", "wallets", "Wallets", "live"),
      page("users", "risk", "Risk", "off"),
    ],
  },
  {
    title: "Blockchain",
    items: [
      page("blockchain", "transactions", "Transactions", "off"),
      page("blockchain", "contracts", "Contracts", "live"),
      page("blockchain", "oracle", "Oracle", "live"),
      page("blockchain", "indexer", "Indexer", "live"),
    ],
  },
  {
    title: "Treasury",
    items: [
      page("treasury", "usdc", "USDC", "off"),
      page("treasury", "fees", "Fees", "off"),
      page("treasury", "withdrawals", "Withdrawals", "off"),
    ],
  },
  {
    title: "Insights",
    items: [
      page("analytics", "overview", "Analytics", "live"),
      page("notifications", "overview", "Notifications", "off"),
    ],
  },
  {
    title: "Settings",
    items: [
      page("settings", "admins", "Admins & roles", "off"),
      page("settings", "categories", "Categories", "live"),
      page("settings", "providers", "Providers", "live"),
      page("settings", "system", "System", "live"),
      page("settings", "audit", "Audit logs", "live"),
    ],
  },
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

export function capabilityLabel(c: AdminCapability): string {
  return c === "live" ? "Live data" : c === "wallet" ? "Wallet-signed actions" : "Not enabled yet";
}
