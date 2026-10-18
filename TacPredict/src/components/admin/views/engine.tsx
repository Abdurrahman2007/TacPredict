import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { nativeMarketFeedQueryOptions } from "@/lib/protocol/market-feed.functions";
import {
  cricketTemplate,
  cryptoWindowTemplate,
  footballTemplate,
  validateDraft,
  type Draft,
  type Fixture,
} from "@/lib/protocol/market-templates.mjs";
import { engineProvidersQuery, fixturesQuery } from "@/lib/sports/sports.functions";
import {
  ASSETS,
  ASSET_KEYS,
  DURATIONS,
  durationLabel,
  matchNativeMarket,
  type UpDownAsset,
} from "@/lib/updown/window.mjs";
import { handOffDraft } from "../draft-handoff";
import { Badge, Card, Loaded, Notice, PageHeader } from "../admin-ui";

export function EngineView({ view }: { view: string }) {
  switch (view) {
    case "crypto":
      return <CryptoWindows />;
    case "providers":
      return <Providers />;
    default:
      return <Fixtures />;
  }
}

function useOpenCreate() {
  const navigate = useNavigate();
  return (draft: Draft) => {
    handOffDraft(draft);
    void navigate({
      to: "/admin/$section",
      params: { section: "markets" },
      search: { view: "create" },
    });
  };
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date(iso)) + " UTC";

function Fixtures() {
  return (
    <div className="adm-stack">
      <PageHeader
        title="Football & Cricket"
        subtitle="Real upcoming matches from the data providers. Each one becomes a draft with the rules already written."
      />
      <Notice tone="info">
        A draft is only terms. You save it, then publish it on Base with your wallet. Trading closes
        at kick-off.
      </Notice>
      <SportCard sport="football" title="Football · La Liga and Champions League" />
      <SportCard sport="cricket" title="Cricket · T20 and Bangladesh matches" />
    </div>
  );
}

function SportCard({ sport, title }: { sport: "football" | "cricket"; title: string }) {
  const query = useQuery(fixturesQuery(sport, 7));
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const open = useOpenCreate();
  const prefix = sport === "football" ? "fd-" : "cd-";
  const existing = new Set(
    (feed.data?.markets ?? []).flatMap((m) =>
      (m.native?.tags ?? []).filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length)),
    ),
  );
  return (
    <Card
      title={title}
      actions={
        <button
          type="button"
          className="adm-btn"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Loading…" : "Reload"}
        </button>
      }
      flush
    >
      <Loaded query={query} label={`${sport} fixtures`}>
        {(data) => {
          if (data.error && data.fixtures.length === 0)
            return (
              <div className="adm-card-body">
                <Notice tone="warn">{data.error}</Notice>
              </div>
            );
          if (data.fixtures.length === 0)
            return (
              <div className="adm-card-body">
                <p className="adm-muted" style={{ margin: 0 }}>
                  No upcoming matches were returned for the next 7 days.
                </p>
              </div>
            );
          return (
            <>
              {data.error ? (
                <div className="adm-card-body">
                  <Notice tone="warn">{data.error}</Notice>
                </div>
              ) : null}
              <div className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Kick-off</th>
                      <th>Match</th>
                      <th>Competition</th>
                      <th>Draft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.fixtures.map((fixture) => (
                      <FixtureRow
                        key={fixture.matchId}
                        fixture={fixture}
                        exists={existing.has(fixture.matchId)}
                        onPrepare={open}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </Loaded>
    </Card>
  );
}

function FixtureRow({
  fixture,
  exists,
  onPrepare,
}: {
  fixture: Fixture;
  exists: boolean;
  onPrepare: (draft: Draft) => void;
}) {
  let draft: Draft | null = null;
  let problem: string | null = null;
  try {
    draft = fixture.sport === "football" ? footballTemplate(fixture) : cricketTemplate(fixture);
    const problems = validateDraft(draft);
    if (problems.length) problem = problems[0] ?? "The draft did not pass the checks.";
  } catch (error) {
    problem = error instanceof Error ? error.message : "No draft.";
  }
  return (
    <tr>
      <td>{when(fixture.startsAt)}</td>
      <td style={{ fontWeight: 650 }}>
        {fixture.home} vs {fixture.away}
      </td>
      <td>{fixture.competition}</td>
      <td>
        {exists ? (
          <Badge tone="ok">Market exists</Badge>
        ) : draft && !problem ? (
          <button
            type="button"
            className="adm-btn adm-btn-primary"
            onClick={() => onPrepare(draft)}
          >
            Prepare market
          </button>
        ) : (
          <span className="adm-muted">{problem}</span>
        )}
      </td>
    </tr>
  );
}

function CryptoWindows() {
  const feed = useQuery(nativeMarketFeedQueryOptions);
  const open = useOpenCreate();
  return (
    <div className="adm-stack">
      <PageHeader
        title="Crypto windows"
        subtitle="Up / Down windows on the UTC clock for BTC, ETH, SOL and BNB. Prices come from Coinbase candles named in the rules."
      />
      <Card flush>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Asset</th>
                {DURATIONS.map((d) => (
                  <th key={d}>{durationLabel(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ASSET_KEYS.map((asset) => (
                <tr key={asset}>
                  <td style={{ fontWeight: 650 }}>{ASSETS[asset].name}</td>
                  {DURATIONS.map((minutes) => (
                    <td key={minutes}>
                      <WindowCell
                        asset={asset}
                        minutes={minutes}
                        markets={feed.data?.markets}
                        onPrepare={open}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="adm-muted" style={{ margin: 0 }}>
        Each button prepares the next window that is at least two minutes away. Windows are
        published one at a time with your wallet.
      </p>
    </div>
  );
}

function WindowCell({
  asset,
  minutes,
  markets,
  onPrepare,
}: {
  asset: UpDownAsset;
  minutes: number;
  markets: Parameters<typeof matchNativeMarket>[0];
  onPrepare: (draft: Draft) => void;
}) {
  const draft = cryptoWindowTemplate(asset, minutes);
  const start = Date.parse(`${draft.times.openAt}:00Z`);
  const exists = matchNativeMarket(markets, asset, {
    start,
    end: start + minutes * 60000,
    minutes,
  });
  const label = new Intl.DateTimeFormat("en-GB", {
    ...(minutes >= 720 ? { day: "2-digit" as const, month: "short" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(start);
  return exists ? (
    <Badge tone="ok">{label} live</Badge>
  ) : (
    <button
      type="button"
      className="adm-btn"
      onClick={() => onPrepare(draft)}
      title={`Window starts ${label} UTC`}
    >
      {label}
    </button>
  );
}

function Providers() {
  const query = useQuery(engineProvidersQuery);
  return (
    <div className="adm-stack">
      <PageHeader title="Providers" subtitle="Where fixtures, scores and prices come from." />
      <Loaded query={query} label="providers">
        {(providers) => (
          <Card flush>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 650 }}>{p.role}</td>
                      <td>{p.name}</td>
                      <td>
                        {p.configured ? (
                          <Badge tone="ok">Configured</Badge>
                        ) : (
                          <Badge tone="warn">Not connected</Badge>
                        )}
                      </td>
                      <td>
                        {p.note}
                        {!p.configured && p.secret ? (
                          <>
                            {" "}
                            Add <span className="adm-mono">{p.secret}</span> as a secret on the
                            Cloudflare Worker.
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Loaded>
      <Card title="What the backend can and can not do">
        <dl className="adm-kv">
          <dt>Can</dt>
          <dd>Read provider data, build market drafts and check their times and rules.</dd>
          <dt>Can not</dt>
          <dd>
            Publish a market, change a balance or a position, finalize a result, or withdraw
            treasury funds. Those need a wallet that holds the matching role on the Base contracts.
          </dd>
          <dt>Execution</dt>
          <dd>
            The current Base Exchange is an order book, not an AMM. Quotes require real orders and
            collateral; no liquidity, fills or balances are fabricated.
          </dd>
          <dt>Results</dt>
          <dd>
            Crypto prices and sports results are handled on separate pages. A suggestion is evidence
            only: a person proposes the result with a wallet, and anyone can dispute it during the
            challenge period.
          </dd>
          <dt>VOID</dt>
          <dd>
            A voided market pays every outcome share 1/N USDC (N outcomes). It is not a refund of
            the price paid, and the rules of every market say so.
          </dd>
        </dl>
      </Card>
      <p className="adm-muted" style={{ margin: 0 }}>
        Polymarket odds are reference only and can not create or publish a market.{" "}
        <Link to="/admin/market-importer" className="adm-link">
          Open the reference importer
        </Link>
      </p>
    </div>
  );
}
