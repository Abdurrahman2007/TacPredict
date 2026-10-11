import type { AdminSection } from "./admin-view";

/** UI navigation for the A→Z admin shell. RPC section keys stay the existing ten. */
export type AdminCapability = "live" | "read" | "operator" | "blocked";

export type AdminNavItem = {
  id: string;
  label: string;
  section: AdminSection;
  capability: AdminCapability;
  note: string;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export const adminNavGroups: AdminNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        section: "Dashboard",
        capability: "read",
        note: "Indexed market/volume/job counts only.",
      },
      {
        id: "analytics",
        label: "Analytics",
        section: "Analytics",
        capability: "read",
        note: "24h/7d finalized trade volume.",
      },
    ],
  },
  {
    title: "Markets",
    items: [
      {
        id: "markets-all",
        label: "All markets",
        section: "Markets",
        capability: "read",
        note: "Indexed markets + prepared metadata drafts.",
      },
      {
        id: "markets-create",
        label: "Create / prepare",
        section: "Markets",
        capability: "live",
        note: "Prepare immutable terms; publish needs wallet + Factory role.",
      },
    ],
  },
  {
    title: "Trading",
    items: [
      {
        id: "trades",
        label: "Trades",
        section: "Trading",
        capability: "read",
        note: "Finalized Exchange fills only. No balance edits.",
      },
      {
        id: "orders-positions",
        label: "Orders / positions",
        section: "Trading",
        capability: "read",
        note: "Bounded investigation views; full export pending.",
      },
    ],
  },
  {
    title: "Resolution",
    items: [
      {
        id: "resolution",
        label: "Resolutions",
        section: "Resolution",
        capability: "operator",
        note: "Propose/finalize via bonded oracle wallet actions.",
      },
      {
        id: "disputes",
        label: "Disputes / evidence",
        section: "Resolution",
        capability: "operator",
        note: "24h challenge window is immutable on-chain.",
      },
    ],
  },
  {
    title: "Users",
    items: [
      {
        id: "users",
        label: "Users & wallets",
        section: "Users",
        capability: "read",
        note: "Account + proven wallet counts. No USDC edits.",
      },
      {
        id: "risk",
        label: "Risk / abuse",
        section: "Users",
        capability: "blocked",
        note: "Flag workflows not shipped; cannot freeze permissionless funds.",
      },
    ],
  },
  {
    title: "Blockchain",
    items: [
      {
        id: "contracts",
        label: "Contracts / indexer",
        section: "Blockchain",
        capability: "read",
        note: "Verified deployment row + checkpoint. Not a live RPC probe.",
      },
      {
        id: "operator",
        label: "Operator console",
        section: "Blockchain",
        capability: "operator",
        note: "Wallet-signed Factory/Oracle/Settlement actions.",
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        id: "treasury",
        label: "Treasury / fees",
        section: "Treasury",
        capability: "blocked",
        note: "No fee/treasury sweep on deployed Exchange.",
      },
      {
        id: "settlement",
        label: "Settlement / claims",
        section: "Resolution",
        capability: "operator",
        note: "Users claim/refund on-chain; admin does not mint balances.",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        id: "audit",
        label: "Audit logs",
        section: "Audit",
        capability: "read",
        note: "Append-only protocol_audit_logs (bounded).",
      },
      {
        id: "settings",
        label: "Settings / roles",
        section: "Settings",
        capability: "blocked",
        note: "Four-role matrix pending. Shared password unlock forbidden.",
      },
    ],
  },
];

export function capabilityLabel(c: AdminCapability): string {
  switch (c) {
    case "live":
      return "Write (guarded)";
    case "read":
      return "Read";
    case "operator":
      return "Wallet operator";
    case "blocked":
      return "Not enabled";
  }
}
