import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { BASE_NETWORK, isAddress, shortAddress } from "@/lib/onchain/base";
import { cryptoLogoUrl } from "@/lib/crypto-logo";
import { poolConfigQueryOptions, poolRoundQueryOptions } from "@/lib/pool/pool.functions";
import { getPoolRoleStatus } from "@/lib/pool/pool-admin.functions";
import type { PoolConfig } from "@/lib/pool/pool-types";
import {
  POOL_ASSET_KEYS,
  POOL_DURATIONS,
  formatUsdc,
  fromScaled,
  nextRoundStart,
  roundStatus,
  unreportedRefundDue,
  usdcAtomic,
  type PoolAsset,
} from "@/lib/pool/pool.mjs";
import {
  deployPool,
  pauseTx,
  poolBytecodeReady,
  predictPoolDeployment,
  reporterRoleTx,
  setFeeTx,
  setLimitsTx,
  setSeriesTx,
  setTreasuryTx,
  voidRoundTx,
  withdrawFeesTx,
} from "@/lib/pool/pool-admin";
import { refundMissedReading } from "@/lib/pool/pool-client";
import { ASSETS, durationLabel, formatUsd } from "@/lib/updown/window.mjs";
import { AddressLink, Badge, Card, Loaded, Notice, PageHeader, Tile, TxLink } from "../admin-ui";

const ONCHAIN = "https://basescan.org";

type Msg = { tone: "info" | "warn" | "bad"; text: ReactNode } | null;

/** One place that runs a wallet transaction, shows its result and refreshes the on-chain reads. */
export function useRunner() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  async function run(key: string, work: () => Promise<Hex>, done: string) {
    if (busy) return;
    setBusy(key);
    setMsg(null);
    try {
      const hash = await work();
      setMsg({
        tone: "info",
        text: (
          <>
            {done} <TxLink hash={hash} />
          </>
        ),
      });
      await queryClient.invalidateQueries({ queryKey: ["pool-config"] });
      await queryClient.invalidateQueries({ queryKey: ["pool-round"] });
      await queryClient.invalidateQueries({ queryKey: ["pool-role"] });
    } catch (error) {
      setMsg({ tone: "bad", text: error instanceof Error ? error.message : "The transaction failed." });
    } finally {
      setBusy(null);
    }
  }
  return { busy, msg, setMsg, run };
}

export function Result({ msg }: { msg: Msg }) {
  return msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null;
}

const pct = (bps: number) => `${(bps / 100).toString()}%`;
/** 1500000 -> "1.5" with no separators, so the text can be typed back into a field. */
const plainUsdc = (atomic: string) => {
  const value = BigInt(atomic);
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${value / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
};

/** Wallet state plus the explicit real-money approval every signing page asks for. */
export function useSigning() {
  const wallet = useBaseWallet();
  const [ack, setAck] = useState(false);
  const onBase = wallet.chainId === BASE_NETWORK.id;
  const ready = Boolean(wallet.provider && wallet.address && onBase && ack);
  return { wallet, ack, setAck, onBase, ready };
}

export function SigningCard({ signing }: { signing: ReturnType<typeof useSigning> }) {
  const { wallet, ack, setAck, onBase } = signing;
  return (
    <Card title="Signing">
      {!wallet.address ? (
        <Notice tone="warn">Connect the administrator wallet (top right) to sign transactions.</Notice>
      ) : !onBase ? (
        <Notice tone="warn">
          The wallet is on another network.{" "}
          <button type="button" className="adm-link" onClick={() => void wallet.switchToBase()}>
            Switch to Base
          </button>
        </Notice>
      ) : (
        <p className="adm-muted" style={{ margin: 0 }}>
          Connected as <span className="adm-mono">{shortAddress(wallet.address)}</span> on Base.
        </p>
      )}
      <label className="flex gap-2 text-xs leading-6" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          className="mt-1.5 size-4 shrink-0"
          checked={ack}
          onChange={(e) => setAck(e.target.checked)}
        />
        I approve signing real-money Base Mainnet transactions. This contract has not had an independent audit, so start
        with small limits.
      </label>
    </Card>
  );
}

export function PoolView({ view }: { view: string }) {
  const signing = useSigning();
  const { ready } = signing;
  const config = useQuery(poolConfigQueryOptions);
  const tab = (data: PoolConfig) =>
    view === "series" ? (
      <SeriesTab config={data} ready={ready} />
    ) : view === "rounds" ? (
      <RoundsTab config={data} ready={ready} />
    ) : view === "setup" ? (
      <SetupTab config={data} ready={ready} />
    ) : (
      <StatusTab config={data} ready={ready} />
    );
  return (
    <div className="adm-stack">
      <PageHeader
        title="Up / Down pool"
        subtitle="Live BTC, ETH, SOL and BNB rounds. Players bet USDC on Base. The contract pays winners and refunds; the administrator cannot touch any balance or position."
      />
      <SigningCard signing={signing} />
      <Loaded query={config} label="pool contract">
        {(data) => tab(data)}
      </Loaded>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */

function StatusTab({ config, ready }: { config: PoolConfig; ready: boolean }) {
  const wallet = useBaseWallet();
  const { busy, msg, run } = useRunner();
  const [fee, setFee] = useState("");
  const [limits, setLimits] = useState({ min: "", user: "", pool: "" });
  const [treasury, setTreasury] = useState("");
  const pool = config.address as Address | null;
  if (!pool)
    return (
      <Notice tone="warn">
        No pool contract is set yet, so nothing can be bet or reported. Open{" "}
        <Link to="/admin/$section" params={{ section: "pool" }} search={{ view: "setup" }} className="adm-link">
          Setup
        </Link>{" "}
        to deploy it.
      </Notice>
    );
  const feeBps = Math.round(Number(fee) * 100);
  const feeOk = fee.trim() !== "" && Number.isFinite(feeBps) && feeBps >= 0 && feeBps <= 1000;
  const min = usdcAtomic(limits.min || plainUsdc(config.minBet));
  const user = usdcAtomic(limits.user || plainUsdc(config.maxPerUser));
  const total = usdcAtomic(limits.pool || plainUsdc(config.maxPool));
  const limitsOk = min !== null && user !== null && total !== null && min > 0n && min <= user && user <= total;
  return (
    <div className="adm-stack">
      <div className="adm-grid-tiles">
        <Tile label="Contract" value={<AddressLink address={pool} label={shortAddress(pool)} />} hint="UpDownPool on Base" />
        <Tile
          label="Betting"
          value={config.paused ? <Badge tone="bad">Paused</Badge> : <Badge tone="ok">Open</Badge>}
          hint="Pausing stops new bets only. Players keep their claims."
        />
        <Tile label="Fee" value={pct(config.feeBps)} hint="Taken from the losing side only" />
        <Tile
          label="Limits per bet / user / round"
          value={`${formatUsdc(config.minBet)} / ${formatUsdc(config.maxPerUser)} / ${formatUsdc(config.maxPool)}`}
          hint="USDC"
        />
        <Tile label="Fees ready to send" value={`${formatUsdc(config.ownerBalance)} USDC`} hint="Goes to the owner account" />
        <Tile label="Owner account" value={<AddressLink address={config.treasury} label={shortAddress(config.treasury)} />} />
      </div>

      <RoleCard pool={pool} />

      <Card title="Actions">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={!ready || busy !== null || BigInt(config.ownerBalance) === 0n}
            onClick={() =>
              void run("withdraw", () => withdrawFeesTx(wallet, pool), "Fees sent to the owner account.")
            }
          >
            {busy === "withdraw" ? "Sending…" : "Send fees to owner account"}
          </button>
          <button
            type="button"
            className="adm-btn"
            disabled={!ready || busy !== null}
            onClick={() =>
              void run(
                "pause",
                () => pauseTx(wallet, pool, !config.paused),
                config.paused ? "Betting resumed." : "Betting paused.",
              )
            }
          >
            {busy === "pause" ? "Waiting…" : config.paused ? "Resume betting" : "Pause betting"}
          </button>
        </div>
        <p className="adm-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
          The fee and any rounding leftovers are credited to the contract's owner balance. Only the owner account can
          receive it, and anyone can trigger the transfer. Player stakes are never part of it.
        </p>
      </Card>

      <Card title="Fee, limits and owner account">
        <div style={{ display: "grid", gap: 16 }}>
          <div className="adm-field">
            Fee on the losing side (0 to 10%)
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="adm-input"
                style={{ maxWidth: 160 }}
                inputMode="decimal"
                placeholder={(config.feeBps / 100).toString()}
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
              <button
                type="button"
                className="adm-btn"
                disabled={!ready || busy !== null || !feeOk}
                onClick={() => void run("fee", () => setFeeTx(wallet, pool, feeBps), "Fee updated. It applies to rounds that have no bets yet.")}
              >
                Update fee
              </button>
            </div>
          </div>
          <div className="adm-field">
            Limits in USDC (smallest bet, per user per round, whole round)
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(
                [
                  ["min", config.minBet],
                  ["user", config.maxPerUser],
                  ["pool", config.maxPool],
                ] as const
              ).map(([key, current]) => (
                <input
                  key={key}
                  className="adm-input"
                  style={{ maxWidth: 140 }}
                  inputMode="decimal"
                  placeholder={plainUsdc(current)}
                  value={limits[key]}
                  onChange={(e) => setLimits({ ...limits, [key]: e.target.value })}
                />
              ))}
              <button
                type="button"
                className="adm-btn"
                disabled={!ready || busy !== null || !limitsOk}
                onClick={() =>
                  void run("limits", () => setLimitsTx(wallet, pool, min ?? 0n, user ?? 0n, total ?? 0n), "Limits updated.")
                }
              >
                Update limits
              </button>
            </div>
          </div>
          <div className="adm-field">
            Owner account (receives the fee and extra dollars)
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="adm-input"
                style={{ maxWidth: 440 }}
                placeholder={config.treasury}
                value={treasury}
                onChange={(e) => setTreasury(e.target.value.trim())}
              />
              <button
                type="button"
                className="adm-btn"
                disabled={!ready || busy !== null || !isAddress(treasury)}
                onClick={() => void run("treasury", () => setTreasuryTx(wallet, pool, treasury as Address), "Owner account updated.")}
              >
                Update owner account
              </button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Result msg={msg} />
        </div>
      </Card>
    </div>
  );
}

/** Reporter and guardian status for the connected wallet, read from the contract. */
function RoleCard({ pool }: { pool: Address }) {
  const wallet = useBaseWallet();
  const who = wallet.address;
  const status = useQuery({
    queryKey: ["pool-role", pool, who],
    queryFn: () => getPoolRoleStatus({ data: { who: who ?? "" } }),
    enabled: Boolean(who && isAddress(who)),
    staleTime: 10000,
    retry: 1,
  });
  return (
    <Card title="Connected wallet">
      {!who ? (
        <p className="adm-muted" style={{ margin: 0 }}>
          Connect a wallet to see which roles it holds on the contract.
        </p>
      ) : status.isPending ? (
        <p className="adm-muted" style={{ margin: 0 }}>
          Reading roles…
        </p>
      ) : status.isError || !status.data ? (
        <Notice tone="warn">Roles could not be read from the contract right now.</Notice>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="adm-mono">{shortAddress(who)}</span>
          <Badge tone={status.data.isAdmin ? "ok" : "mute"}>Admin {status.data.isAdmin ? "yes" : "no"}</Badge>
          <Badge tone={status.data.isGuardian ? "ok" : "mute"}>Guardian {status.data.isGuardian ? "yes" : "no"}</Badge>
          <Badge tone={status.data.isReporter ? "ok" : "mute"}>Reporter {status.data.isReporter ? "yes" : "no"}</Badge>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------------------------- */

function SeriesTab({ config, ready }: { config: PoolConfig; ready: boolean }) {
  const wallet = useBaseWallet();
  const { busy, msg, run } = useRunner();
  const pool = config.address as Address | null;
  if (!pool)
    return (
      <Notice tone="warn">
        Deploy the contract first. Series can be turned on once it exists.
      </Notice>
    );
  return (
    <div className="adm-stack">
      <Card title="Live series" flush>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Asset</th>
                {POOL_DURATIONS.map((d) => (
                  <th key={d}>{durationLabel(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POOL_ASSET_KEYS.map((asset) => (
                <tr key={asset}>
                  <td style={{ fontWeight: 650 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <img src={cryptoLogoUrl(ASSETS[asset].logo)} alt="" width={22} height={22} />
                      {ASSETS[asset].name}
                    </span>
                  </td>
                  {POOL_DURATIONS.map((minutes) => {
                    const key = `${asset}:${minutes}`;
                    const on = config.series[key] === true;
                    return (
                      <td key={minutes}>
                        <button
                          type="button"
                          className={on ? "adm-btn" : "adm-btn adm-btn-primary"}
                          disabled={!ready || busy !== null}
                          onClick={() =>
                            void run(
                              key,
                              () => setSeriesTx(wallet, pool, asset, minutes, !on),
                              `${ASSETS[asset].name} ${durationLabel(minutes)} is now ${on ? "off" : "live"}.`,
                            )
                          }
                        >
                          {busy === key ? "Waiting…" : on ? "Live · turn off" : "Turn on"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Result msg={msg} />
      <p className="adm-muted" style={{ margin: 0, fontSize: 12.5 }}>
        A live series opens a new round on the UTC clock all day without any manual step. Turning a series off only
        stops new bets in future rounds; rounds already bet on still settle and pay out. For a guided start use{" "}
        <Link to="/admin/$section" params={{ section: "markets" }} search={{ view: "create" }} className="adm-link">
          Create market → Crypto
        </Link>
        .
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */

function RoundsTab({ config, ready }: { config: PoolConfig; ready: boolean }) {
  const wallet = useBaseWallet();
  const { busy, msg, run } = useRunner();
  const [asset, setAsset] = useState<PoolAsset>("bitcoin");
  const [minutes, setMinutes] = useState(5);
  const [offset, setOffset] = useState(0);
  const [reason, setReason] = useState("");
  const nowMs = useMemo(() => Date.now(), [asset, minutes, offset, busy]);
  const size = minutes * 60000;
  // offset 0 is the round open for bets; negative numbers are rounds that already started.
  const startMs = nextRoundStart(nowMs, minutes) + offset * size;
  const pool = (config.address ?? null) as Address | null;
  const round = useQuery(poolRoundQueryOptions(asset, minutes, startMs, Boolean(pool)));
  if (!pool) return <Notice tone="warn">Deploy the contract first.</Notice>;
  const nowSec = Math.floor(nowMs / 1000);
  const data = round.data;
  const status = data ? roundStatus(data, nowSec) : null;
  const total = data ? BigInt(data.up) + BigInt(data.down) : 0n;
  const canVoid = Boolean(data && Number(data.state) !== 2 && !(status?.kind === "settled") && total > 0n);
  const missed = Boolean(data && unreportedRefundDue(data, Math.floor(startMs / 1000), minutes, nowSec));
  const label = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(startMs);
  return (
    <div className="adm-stack">
      <Card title="Pick a round">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <select className="adm-select" style={{ maxWidth: 200 }} value={asset} onChange={(e) => setAsset(e.target.value as PoolAsset)}>
            {POOL_ASSET_KEYS.map((key) => (
              <option key={key} value={key}>
                {ASSETS[key].name}
              </option>
            ))}
          </select>
          <select className="adm-select" style={{ maxWidth: 160 }} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {POOL_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {durationLabel(d)}
              </option>
            ))}
          </select>
          <button type="button" className="adm-btn" onClick={() => setOffset(offset - 1)}>
            ← Earlier
          </button>
          <button type="button" className="adm-btn" disabled={offset >= 0} onClick={() => setOffset(Math.min(0, offset + 1))}>
            Later →
          </button>
        </div>
        <p className="adm-muted" style={{ margin: "10px 0 0" }}>
          Round starting <b>{label} UTC</b>
          {offset === 0 ? " (open for bets now)" : ""}
        </p>
      </Card>

      <Loaded query={round} label="round">
        {(r) =>
          !r ? (
            <Notice tone="warn">This round could not be read from the contract.</Notice>
          ) : (
          <Card title="Round on chain">
            <div className="adm-grid-tiles">
              <Tile label="State" value={status ? <Badge tone={status.kind === "refund" ? "bad" : status.kind === "open" ? "info" : "ok"}>{status.label}</Badge> : "—"} />
              <Tile label="Up pool" value={`${formatUsdc(r.up)} USDC`} />
              <Tile label="Down pool" value={`${formatUsdc(r.down)} USDC`} />
              <Tile
                label="Start price"
                value={BigInt(r.startPrice) > 0n ? formatUsd(fromScaled(r.startPrice), asset) : "Not posted"}
              />
              <Tile
                label="End price"
                value={BigInt(r.endPrice) > 0n ? formatUsd(fromScaled(r.endPrice), asset) : "Not posted"}
              />
              <Tile label="Fee on this round" value={r.feeBps ? pct(r.feeBps) : "Set at first bet"} />
            </div>
          </Card>
          )
        }
      </Loaded>

      <Card title="Refund control">
        <p className="adm-muted" style={{ marginTop: 0 }}>
          A refund returns every stake in the round to its player, exactly what they bet, and no fee is taken. It can be
          started only before payouts open. The administrator cannot change who won, edit a balance or move a position.
        </p>
        <div className="adm-field">
          Reason (saved on chain as a hash)
          <input
            className="adm-input"
            style={{ maxWidth: 420 }}
            value={reason}
            maxLength={120}
            onChange={(e) => setReason(e.target.value)}
            placeholder="for example: price feed outage"
          />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={!ready || busy !== null || !canVoid || reason.trim().length < 3}
            onClick={() =>
              void run(
                "void",
                () => voidRoundTx(wallet, pool, asset, minutes, startMs, reason.trim()),
                "Round refunded. Players can take their stake back.",
              )
            }
          >
            {busy === "void" ? "Waiting…" : "Refund everyone in this round"}
          </button>
          <button
            type="button"
            className="adm-btn"
            disabled={!ready || busy !== null || !missed}
            onClick={() =>
              void run(
                "missed",
                () => refundMissedReading(wallet, pool, { asset, minutes, startMs }),
                "Round refunded because a price reading never arrived.",
              )
            }
          >
            {busy === "missed" ? "Waiting…" : "Refund: price reading missing"}
          </button>
        </div>
        {!canVoid && data ? (
          <p className="adm-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
            {total === 0n
              ? "This round has no bets."
              : status?.kind === "settled"
                ? "Payouts are already open, so the round can no longer be refunded."
                : "This round is already refunded."}
          </p>
        ) : null}
        <div style={{ marginTop: 12 }}>
          <Result msg={msg} />
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------------------------- */

function SetupTab({ config, ready }: { config: PoolConfig; ready: boolean }) {
  const wallet = useBaseWallet();
  const { busy, msg, run, setMsg } = useRunner();
  const [treasury, setTreasury] = useState("");
  const [feeText, setFeeText] = useState("3");
  const [reporter, setReporter] = useState("");
  const [deployed, setDeployed] = useState<{ address: string; hash: string } | null>(null);
  const pool = config.address as Address | null;
  const owner = (isAddress(treasury) ? treasury : wallet.address) as Address | null;
  const feeBps = Math.round(Number(feeText) * 100);
  const feeOk = Number.isFinite(feeBps) && feeBps >= 0 && feeBps <= 1000;
  const bytecode = poolBytecodeReady();
  const plan = useMemo(() => {
    if (!bytecode || !wallet.address || !owner || !isAddress(wallet.address) || !feeOk) return null;
    try {
      return predictPoolDeployment(wallet.address as Address, owner, feeBps);
    } catch {
      return null;
    }
  }, [bytecode, wallet.address, owner, feeBps, feeOk]);
  async function deploy() {
    if (!wallet.address || !owner || busy) return;
    setMsg(null);
    try {
      let result: { hash: Hex; address: Address } | null = null;
      await run(
        "deploy",
        async () => {
          result = await deployPool(wallet, owner, feeBps);
          return result.hash;
        },
        "Contract deployed.",
      );
      const done = result as { hash: Hex; address: Address } | null;
      if (done) setDeployed(done);
    } catch {
      /* run() already shows the error */
    }
  }
  return (
    <div className="adm-stack">
      {pool ? (
        <Notice tone="info">
          Pool contract in use: <AddressLink address={pool} />. Deploying again creates a separate contract; the site keeps
          using the one set in its configuration.
        </Notice>
      ) : null}

      <Card title="1 · Deploy the contract">
        {!bytecode ? (
          <Notice tone="warn">
            The compiled contract is not packaged in this build, so it cannot be deployed from here yet.
          </Notice>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <p className="adm-muted" style={{ margin: 0 }}>
              This adds a <b>new</b> contract next to the existing ones. Nothing already deployed is touched. The connected
              wallet becomes the contract administrator and guardian.
            </p>
            <div className="adm-field">
              Owner account (receives the fee and extra dollars). Leave empty to use the connected wallet.
              <input
                className="adm-input"
                style={{ maxWidth: 440 }}
                placeholder={wallet.address ?? "0x…"}
                value={treasury}
                onChange={(e) => setTreasury(e.target.value.trim())}
              />
            </div>
            <div className="adm-field">
              Fee on the losing side, percent (0 to 10)
              <input
                className="adm-input"
                style={{ maxWidth: 140 }}
                inputMode="decimal"
                value={feeText}
                onChange={(e) => setFeeText(e.target.value)}
              />
            </div>
            {plan ? (
              <dl className="adm-kv">
                <dt>Contract address</dt>
                <dd>
                  <AddressLink address={plan.address} />
                </dd>
                <dt>Network</dt>
                <dd>Base Mainnet · native USDC {shortAddress(BASE_NETWORK.usdc)}</dd>
              </dl>
            ) : null}
            <div>
              <button
                type="button"
                className="adm-btn adm-btn-primary"
                disabled={!ready || busy !== null || !plan}
                onClick={() => void deploy()}
              >
                {busy === "deploy" ? "Deploying…" : "Deploy UpDownPool"}
              </button>
            </div>
            {deployed ? (
              <Notice tone="info">
                Deployed at <AddressLink address={deployed.address} />. Next, set the Cloudflare variable{" "}
                <span className="adm-mono">UPDOWN_POOL_ADDRESS</span> to this address (or send it to the developer to
                commit). Until then the public site does not know about it.
              </Notice>
            ) : null}
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <Result msg={msg} />
        </div>
      </Card>

      <Card title="2 · Reporter wallet (posts the CoinGecko price)">
        <p className="adm-muted" style={{ marginTop: 0 }}>
          A separate hot wallet posts each round's start and end price. It can only post prices. It cannot move USDC,
          change a balance or withdraw. Create it yourself, keep its key only as a secret on the server, and fund it with a
          little ETH for gas. Never paste the key anywhere else.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="adm-input"
            style={{ maxWidth: 440 }}
            placeholder="Reporter wallet address 0x…"
            value={reporter}
            onChange={(e) => setReporter(e.target.value.trim())}
          />
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            disabled={!ready || busy !== null || !pool || !isAddress(reporter)}
            onClick={() =>
              void run("grant", () => reporterRoleTx(wallet, pool as Address, reporter as Address, true), "Reporter role granted.")
            }
          >
            Grant reporter role
          </button>
          <button
            type="button"
            className="adm-btn"
            disabled={!ready || busy !== null || !pool || !isAddress(reporter)}
            onClick={() =>
              void run("revoke", () => reporterRoleTx(wallet, pool as Address, reporter as Address, false), "Reporter role removed.")
            }
          >
            Remove role
          </button>
        </div>
        {isAddress(reporter) && pool ? <ReporterStatus pool={pool} who={reporter} /> : null}
      </Card>

      <Card title="3 · Server secrets">
        <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            <span className="adm-mono">UPDOWN_POOL_ADDRESS</span> — the contract address above (a plain variable).
          </li>
          <li>
            <span className="adm-mono">POOL_REPORTER_PRIVATE_KEY</span> — the reporter wallet key (a secret).
          </li>
          <li>
            <span className="adm-mono">COINGECKO_DEMO_API_KEY</span> — already used by the price pages.
          </li>
        </ul>
        <p className="adm-muted" style={{ margin: "10px 0 0", fontSize: 12.5 }}>
          Basescan:{" "}
          <a className="adm-link" href={`${ONCHAIN}/address/${BASE_NETWORK.usdc}`} target="_blank" rel="noopener noreferrer">
            native USDC
          </a>
          . Source verification is not a security audit.
        </p>
      </Card>
    </div>
  );
}

function ReporterStatus({ pool, who }: { pool: Address; who: string }) {
  const status = useQuery({
    queryKey: ["pool-role", pool, who],
    queryFn: () => getPoolRoleStatus({ data: { who } }),
    staleTime: 8000,
    retry: 1,
  });
  if (status.isPending) return <p className="adm-muted">Reading…</p>;
  if (status.isError || !status.data) return <Notice tone="warn">Could not read this wallet from the contract.</Notice>;
  const eth = Number(BigInt(status.data.ethBalance)) / 1e18;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
      <Badge tone={status.data.isReporter ? "ok" : "warn"}>{status.data.isReporter ? "Has reporter role" : "No reporter role yet"}</Badge>
      <Badge tone={eth > 0.0005 ? "ok" : "warn"}>{eth.toFixed(5)} ETH for gas</Badge>
    </div>
  );
}
