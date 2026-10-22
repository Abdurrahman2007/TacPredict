import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { cryptoLogoUrl } from "@/lib/crypto-logo";
import { poolConfigQueryOptions } from "@/lib/pool/pool.functions";
import { saveSeriesCopy, seriesCopyQueryOptions } from "@/lib/pool/pool-admin.functions";
import { setSeriesTx } from "@/lib/pool/pool-admin";
import { cleanCopy, copyFor } from "@/lib/pool/series-copy.mjs";
import type { PoolConfig } from "@/lib/pool/pool-types";
import {
  POOL_ASSET_KEYS,
  POOL_DURATIONS,
  nextRoundStart,
  poolRules,
  type PoolAsset,
} from "@/lib/pool/pool.mjs";
import { ASSETS, durationLabel } from "@/lib/updown/window.mjs";
import { Badge, Card, Loaded, Notice, PageHeader } from "../admin-ui";
import { SigningCard, useSigning } from "./pool";
import { RoundHistory } from "./round-history";

type Signing = ReturnType<typeof useSigning>;
type Saved = Parameters<typeof copyFor>[0];

const utc = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
  hour12: false,
});
const local = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * Crypto comes first by coin. Picking BTC, ETH, SOL or BNB fills in everything: the title and
 * description (editable), the Up / Down outcomes (fixed), the CoinGecko price rule (fixed), the real
 * logo, and the round times, which run on the UTC clock without any manual step.
 */
export function CryptoSeries() {
  const signing = useSigning();
  const config = useQuery(poolConfigQueryOptions);
  const saved = useQuery(seriesCopyQueryOptions);
  const [asset, setAsset] = useState<PoolAsset | null>(null);
  return (
    <div className="adm-stack">
      <PageHeader title="Crypto · Up / Down" subtitle="Select coin · configure series" />
      <Card title="Coin">
        <div
          role="group"
          aria-label="Coin"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
            gap: 12,
          }}
        >
          {POOL_ASSET_KEYS.map((key) => {
            const live = config.data
              ? POOL_DURATIONS.filter((d) => config.data?.series[`${key}:${d}`] === true).length
              : null;
            return (
              <button
                key={key}
                type="button"
                className="adm-btn"
                aria-pressed={asset === key}
                onClick={() => setAsset(key)}
                style={{
                  justifyContent: "flex-start",
                  minHeight: 64,
                  gap: 12,
                  padding: "0 14px",
                  borderColor: asset === key ? "var(--adm-brand)" : undefined,
                  boxShadow: asset === key ? "0 0 0 2px var(--adm-brand-soft)" : undefined,
                }}
              >
                <img src={cryptoLogoUrl(ASSETS[key].logo)} alt="" width={36} height={36} />
                <span style={{ display: "grid", textAlign: "left", lineHeight: 1.25 }}>
                  <span>{ASSETS[key].name}</span>
                  <span className="adm-muted" style={{ fontSize: 12, fontWeight: 500 }}>
                    {ASSETS[key].short} ·{" "}
                    {live === null
                      ? "…"
                      : live === 0
                        ? "not live"
                        : `${live} of ${POOL_DURATIONS.length} live`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {asset ? (
        <Loaded query={config} label="pool contract">
          {(data) => (
            <AssetForm
              key={asset}
              asset={asset}
              config={data}
              saved={saved.data}
              signing={signing}
            />
          )}
        </Loaded>
      ) : (
        <Notice tone="info">Choose a coin above to continue.</Notice>
      )}

      <RoundHistory key={asset ?? "bitcoin"} asset={asset ?? "bitcoin"} />
      <SigningCard signing={signing} />
    </div>
  );
}

function AssetForm({
  asset,
  config,
  saved,
  signing,
}: {
  asset: PoolAsset;
  config: PoolConfig;
  saved: Saved;
  signing: Signing;
}) {
  const queryClient = useQueryClient();
  const start = copyFor(saved, asset);
  const [title, setTitle] = useState(start.title);
  const [description, setDescription] = useState(start.description);
  const [chosen, setChosen] = useState<number[]>([...POOL_DURATIONS]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warn" | "bad"; text: string } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, []);

  const info = ASSETS[asset];
  const pool = config.address as Address | null;
  const clean = cleanCopy({ title, description });
  const problem = "error" in clean ? clean.error : null;
  const target = chosen.filter((m) => config.series[`${asset}:${m}`] !== true);
  const sample = chosen[0] ?? POOL_DURATIONS[0] ?? 5;

  const toggle = (minutes: number) =>
    setChosen((list) =>
      list.includes(minutes) ? list.filter((m) => m !== minutes) : [...list, minutes],
    );

  async function saveText() {
    if ("error" in clean) throw Error(clean.error);
    await saveSeriesCopy({ data: { asset, title: clean.title, description: clean.description } });
    await queryClient.invalidateQueries({ queryKey: ["pool-series-copy"] });
  }

  async function onSave() {
    if (busy) return;
    setBusy("save");
    setMsg(null);
    try {
      await saveText();
      setMsg({
        tone: "info",
        text: "Title and description saved. The site shows them on the next refresh.",
      });
    } catch (error) {
      setMsg({ tone: "bad", text: error instanceof Error ? error.message : "Could not save." });
    } finally {
      setBusy(null);
    }
  }

  async function onGoLive() {
    if (busy || !pool) return;
    setBusy("live");
    setMsg(null);
    const done: string[] = [];
    try {
      await saveText();
      for (const minutes of target) {
        setMsg({
          tone: "info",
          text: `Turning on ${durationLabel(minutes)}… confirm in your wallet.`,
        });
        await setSeriesTx(signing.wallet, pool, asset, minutes, true);
        done.push(durationLabel(minutes));
      }
      setMsg({
        tone: "info",
        text: done.length
          ? `${info.name} is live for ${done.join(", ")}. New rounds open automatically on the UTC clock.`
          : `${info.name} text saved. Every chosen round length was already live.`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The transaction failed.";
      setMsg({
        tone: "bad",
        text: `${done.length ? `Already on: ${done.join(", ")}. ` : ""}${reason}`,
      });
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: ["pool-config"] });
    }
  }

  return (
    <>
      <Card title="Basic Info">
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <img src={cryptoLogoUrl(info.logo)} alt={`${info.name} logo`} width={52} height={52} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{info.name}</div>
            <div className="adm-muted" style={{ fontSize: 12.5 }}>
              Official {info.short} logo · pre-installed
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 14 }}>
          <label className="adm-field">
            Title
            <input
              className="adm-input"
              value={title}
              maxLength={80}
              disabled={busy !== null}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="adm-field">
            Description
            <textarea
              className="adm-textarea"
              rows={3}
              value={description}
              maxLength={400}
              disabled={busy !== null}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="adm-field">
            Outcomes
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge tone="ok">1 · Up</Badge>
              <Badge tone="bad">2 · Down</Badge>
              <span
                className="adm-muted"
                style={{ fontSize: 12.5, fontWeight: 500, alignSelf: "center" }}
              >
                Fixed order.
              </span>
            </div>
          </div>
          <div className="adm-field">
            Resolution source
            <div>
              <Badge tone="info">CoinGecko USD price</Badge>{" "}
              <span className="adm-muted" style={{ fontSize: 12.5, fontWeight: 500 }}>
                Reported boundary prices determine the result.
              </span>
            </div>
          </div>
        </div>
        {problem ? (
          <div style={{ marginTop: 12 }}>
            <Notice tone="warn">{problem}</Notice>
          </div>
        ) : null}
      </Card>

      <Card title="Timing" flush>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Use</th>
                <th>Length</th>
                <th>Status</th>
                <th>Next round starts</th>
              </tr>
            </thead>
            <tbody>
              {POOL_DURATIONS.map((minutes) => {
                const on = config.series[`${asset}:${minutes}`] === true;
                const next = now ? nextRoundStart(now, minutes) : 0;
                return (
                  <tr key={minutes}>
                    <td>
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`Use ${durationLabel(minutes)}`}
                        checked={chosen.includes(minutes)}
                        disabled={busy !== null}
                        onChange={() => toggle(minutes)}
                      />
                    </td>
                    <td style={{ fontWeight: 650 }}>{durationLabel(minutes)}</td>
                    <td>{on ? <Badge tone="ok">Live</Badge> : <Badge tone="mute">Off</Badge>}</td>
                    <td>
                      {next ? (
                        <>
                          {utc.format(next)} UTC{" "}
                          <span className="adm-muted">· {local.format(next)} your time</span>
                        </>
                      ) : (
                        "…"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Rules">
        <details>
          <summary className="adm-link">Review fixed rules</summary>
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.65, fontSize: 13 }}>
            {poolRules(asset, sample, config.address ? config.feeBps : 300).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
        {!config.address ? (
          <p className="adm-muted" style={{ margin: "8px 0 0", fontSize: 12.5 }}>
            The fee shown is the default until the contract is deployed.
          </p>
        ) : null}
      </Card>

      <Card title="Settings">
        {!pool ? (
          <Notice tone="warn">
            The pool contract is not deployed yet, so a series cannot go live. You can still save
            the title and description now. Deploy it in{" "}
            <Link
              to="/admin/$section"
              params={{ section: "pool" }}
              search={{ view: "setup" }}
              className="adm-link"
            >
              Up / Down pool → Setup
            </Link>
            .
          </Notice>
        ) : (
          <p className="adm-muted" style={{ margin: "0 0 12px" }}>
            {target.length
              ? `This turns on ${target.map(durationLabel).join(", ")} for ${info.name}. One wallet confirmation per round length.`
              : "Every chosen round length is already live."}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="adm-btn"
            disabled={busy !== null || problem !== null}
            onClick={() => void onSave()}
          >
            {busy === "save" ? "Saving…" : "Save text"}
          </button>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={
              busy !== null || problem !== null || !pool || !signing.ready || chosen.length === 0
            }
            onClick={() => void onGoLive()}
          >
            {busy === "live" ? "Enabling…" : "Enable series"}
          </button>
        </div>
        {!signing.ready && pool ? (
          <p className="adm-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
            Connect the administrator wallet on Base and tick the approval box below to enable Go
            live.
          </p>
        ) : null}
        {msg ? (
          <div style={{ marginTop: 12 }}>
            <Notice tone={msg.tone}>{msg.text}</Notice>
          </div>
        ) : null}
      </Card>
    </>
  );
}
