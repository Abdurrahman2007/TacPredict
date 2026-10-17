import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Market } from "@/domain/markets/types";
import { marketSection } from "@/domain/markets/sections.mjs";
import { NativeOperatorConsole, type ResolverPrefill } from "@/components/native-operator-console";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import { getCryptoEvidence, getSportsEvidence } from "@/lib/sports/sports.functions";
import { proposalFor } from "@/lib/sports/fixtures.mjs";
import { canonicalJson } from "@/lib/sports/evidence.mjs";
import { ASSETS, ASSET_KEYS, DURATIONS, type UpDownAsset } from "@/lib/updown/window.mjs";
import { Badge, Card, Loaded, Notice, PageHeader } from "../admin-ui";

type Kind = "crypto" | "sports";
type Pack = Awaited<ReturnType<typeof getSportsEvidence>>;
type Checked = { market: Market; pack: Pack; proposal: { outcome: number; voided: boolean } | null };

const utc = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date(iso)) + " UTC";

function cryptoWindow(m: Market): { asset: UpDownAsset; startMs: number; minutes: number } | null {
  if (m.category !== "Crypto" || !/up or down/i.test(m.title) || !m.native) return null;
  const asset = ASSET_KEYS.find((a) => new RegExp(`\\b(${ASSETS[a].name}|${ASSETS[a].short})\\b`, "i").test(m.title));
  const startMs = Date.parse(m.native.openAt);
  const minutes = (Date.parse(m.native.closeAt) - startMs) / 60000;
  return asset && Number.isFinite(startMs) && DURATIONS.includes(minutes) ? { asset, startMs, minutes } : null;
}

function sportsMatch(m: Market): { sport: "football" | "cricket"; matchId: string } | null {
  const section = marketSection(m);
  if (section !== "Football" && section !== "Cricket") return null;
  const prefix = section === "Football" ? "fd-" : "cd-";
  const tag = m.native?.tags.find((t) => t.startsWith(prefix));
  return tag ? { sport: section === "Football" ? "football" : "cricket", matchId: tag.slice(prefix.length) } : null;
}

const COPY = {
  crypto: {
    title: "Crypto oracle",
    subtitle: "Up / Down windows that have closed. The evidence is the two exact Coinbase candles named in the rules.",
    empty: "No closed Up / Down windows are waiting for a result.",
  },
  sports: {
    title: "Sports results",
    subtitle: "Football and Cricket matches that have closed. The provider result is evidence for you to review, not a decision.",
    empty: "No closed Football or Cricket markets are waiting for a result.",
  },
} as const;

export function ResolutionEvidence({ kind }: { kind: Kind }) {
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const [busy, setBusy] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [prefill, setPrefill] = useState<ResolverPrefill | null>(null);
  const copy = COPY[kind];

  async function check(market: Market) {
    if (!market.native) return;
    setBusy(market.id);
    setPrefill(null);
    try {
      let pack: Pack;
      let proposal: Checked["proposal"] = null;
      if (kind === "crypto") {
        const w = cryptoWindow(market);
        if (!w) return;
        pack = await getCryptoEvidence({ data: w });
        const outcome = String(pack.evidence?.["outcome"] ?? "");
        const index = market.outcomes.findIndex((o) => o.label.toLowerCase() === outcome.toLowerCase());
        proposal = index >= 0 ? { outcome: index, voided: false } : null;
      } else {
        const match = sportsMatch(market);
        if (!match) return;
        pack = await getSportsEvidence({
          data: { ...match, closeMs: Date.parse(market.native.closeAt) },
        });
        proposal = proposalFor(
          match.sport,
          pack.result,
          market.outcomes.map((o) => o.label),
        );
      }
      setChecked({ market, pack, proposal });
    } catch (error) {
      setChecked({
        market,
        pack: {
          result: null,
          evidence: null,
          evidenceHash: null,
          observedAt: null,
          error: error instanceof Error ? error.message : "The check failed.",
        },
        proposal: null,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="adm-stack">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      <Loaded query={feed} label="markets">
        {(data) => {
          const rows = data.markets.filter(
            (m) =>
              m.native &&
              ["CLOSED", "RESOLVING"].includes(m.native.status) &&
              (kind === "crypto" ? cryptoWindow(m) !== null : sportsMatch(m) !== null),
          );
          return (
            <Card flush>
              {rows.length === 0 ? (
                <div className="adm-card-body">
                  <p className="adm-muted" style={{ margin: 0 }}>
                    {copy.empty}
                  </p>
                </div>
              ) : (
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Closed</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((m) => (
                        <tr key={m.id}>
                          <td style={{ fontWeight: 650 }}>{m.title}</td>
                          <td>{m.native ? utc(m.native.closeAt) : ""}</td>
                          <td>
                            <Badge tone={m.native?.status === "RESOLVING" ? "info" : "warn"}>{m.native?.status}</Badge>
                          </td>
                          <td>
                            <button type="button" className="adm-btn" disabled={busy !== null} onClick={() => void check(m)}>
                              {busy === m.id ? "Checking…" : "Check evidence"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        }}
      </Loaded>

      {checked ? (
        <Card title={checked.market.title}>
          {checked.pack.error ? <Notice tone="warn">{checked.pack.error}</Notice> : null}
          {checked.pack.result ? (
            <p style={{ margin: "0 0 10px" }}>
              <b>{checked.pack.result.state === "final" ? "Result found. " : checked.pack.result.state === "void" ? "Suggests VOID. " : checked.pack.result.state === "pending" ? "Not final yet. " : "Needs a person. "}</b>
              {checked.pack.result.note}
            </p>
          ) : null}
          {checked.proposal ? (
            <p style={{ margin: "0 0 10px" }}>
              Suggested proposal:{" "}
              <b>{checked.proposal.voided ? "VOID" : (checked.market.outcomes[checked.proposal.outcome]?.label ?? "")}</b>.
              Nothing is sent until you sign it with your wallet.
            </p>
          ) : checked.pack.result ? (
            <p className="adm-muted" style={{ margin: "0 0 10px" }}>
              No automatic suggestion. Check the official source and decide.
            </p>
          ) : null}
          {checked.pack.evidence ? (
            <>
              <p className="adm-muted" style={{ margin: "0 0 6px" }}>
                Evidence text (the hash is calculated from exactly this text; keep it so others can check it):
              </p>
              <pre className="adm-mono" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>
                {canonicalJson(checked.pack.evidence)}
              </pre>
              <dl className="adm-kv" style={{ marginTop: 10 }}>
                <dt>Evidence hash</dt>
                <dd className="adm-mono" style={{ overflowWrap: "anywhere" }}>
                  {checked.pack.evidenceHash}
                </dd>
              </dl>
              <div className="adm-tabs" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="adm-btn"
                  onClick={() => void navigator.clipboard?.writeText(canonicalJson(checked.pack.evidence))}
                >
                  Copy evidence text
                </button>
                {checked.proposal && checked.market.native && checked.pack.evidenceHash && checked.pack.observedAt ? (
                  <button
                    type="button"
                    className="adm-btn adm-btn-primary"
                    onClick={() =>
                      setPrefill({
                        marketId: checked.market.native?.onchainId ?? "",
                        outcome: checked.proposal?.outcome ?? 0,
                        voided: checked.proposal?.voided ?? false,
                        evidenceHash: checked.pack.evidenceHash ?? "",
                        observedAt: checked.pack.observedAt ?? "",
                      })
                    }
                  >
                    Fill the propose form
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      ) : null}

      {prefill ? (
        <Card title="Propose with your wallet">
          <NativeOperatorConsole key={prefill.marketId + prefill.evidenceHash} prepared={null} outcomeCount={2} resolverPrefill={prefill} />
        </Card>
      ) : null}
    </div>
  );
}
