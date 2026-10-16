import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "mute";

export const BASESCAN = "https://basescan.org";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="adm-head">
      <div>
        <h1 className="adm-h1">{title}</h1>
        {subtitle ? <p className="adm-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="adm-tile">
      <div className="adm-tile-label">{label}</div>
      <div className="adm-tile-value">{value}</div>
      {hint ? <div className="adm-tile-hint">{hint}</div> : null}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  flush,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="adm-card">
      {title ? (
        <div className="adm-card-head">
          <h2>{title}</h2>
          {actions}
        </div>
      ) : null}
      {flush ? children : <div className="adm-card-body">{children}</div>}
    </section>
  );
}

export function Badge({ tone = "mute", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="adm-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <div className="adm-notice" data-tone={tone} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </div>
  );
}

/** A page that cannot show real data yet. It states exactly what is missing and shows nothing invented. */
export function Unavailable({
  title,
  children,
  needs,
}: {
  title: string;
  children: ReactNode;
  needs?: string;
}) {
  return (
    <div className="adm-unavail">
      <div>
        <Badge tone="warn">Not enabled yet</Badge>
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {needs ? (
        <p>
          <b>Needs:</b> {needs}
        </p>
      ) : null}
    </div>
  );
}

/** Loading / error wrapper for any react-query result. Errors never fall back to zeros. */
export function Loaded<T>({
  query,
  label,
  children,
}: {
  query: UseQueryResult<T>;
  label: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending)
    return (
      <div className="adm-notice" role="status">
        Loading {label}…
      </div>
    );
  if (query.isError)
    return (
      <div className="adm-notice" data-tone="bad" role="alert">
        {label} could not be loaded. Nothing has been estimated or substituted.{" "}
        <button type="button" className="adm-link" onClick={() => void query.refetch()}>
          Retry
        </button>
      </div>
    );
  return <>{children(query.data as T)}</>;
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      className="adm-mono adm-link"
      href={`${BASESCAN}/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label ?? address}
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  const short = hash.length > 14 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
  return (
    <a
      className="adm-mono adm-link"
      href={`${BASESCAN}/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      {short}
    </a>
  );
}

export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case "OPEN":
      return "ok";
    case "UPCOMING":
      return "info";
    case "CLOSED":
    case "RESOLVING":
      return "warn";
    case "RESOLVED":
    case "SETTLED":
      return "brand";
    case "VOID":
    case "CANCELLED":
      return "bad";
    default:
      return "mute";
  }
}
