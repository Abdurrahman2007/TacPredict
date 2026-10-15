import { atomicToDecimal, formatTimestamp, parseTradeRow, priceToCents } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot } from "../admin-data";
import { Card, Loaded, Notice, PageHeader, TxLink, Unavailable } from "../admin-ui";

export function TradingView({ view }: { view: string }) {
  switch (view) {
    case "orders":
      return (
        <div className="adm-stack">
          <PageHeader title="Orders" subtitle="Signed limit orders in the order book." />
          <Unavailable
            title="Order book administration is not enabled"
            needs="An admin read function over protocol_orders with the same assigned-admin and authenticator checks. The current snapshot function does not expose orders."
          >
            Open, filled and cancelled orders are not listed here because nothing is read for them
            yet. No order counts or depths are estimated.
          </Unavailable>
        </div>
      );
    case "positions":
      return (
        <div className="adm-stack">
          <PageHeader title="Positions" subtitle="Outcome-token holdings." />
          <Unavailable
            title="Position administration is not enabled"
            needs="An admin read function over protocol_positions. Balances and positions are read-only chain truth and are never edited by administrators."
          >
            Per-user positions are not listed because no admin read exists for them. Holdings are
            owned by wallets on Base; this panel cannot change them.
          </Unavailable>
        </div>
      );
    case "liquidity":
      return (
        <div className="adm-stack">
          <PageHeader title="Liquidity" subtitle="Depth and market-maker activity." />
          <Unavailable
            title="Liquidity administration is not enabled"
            needs="Order-book depth and market-maker reads. Per-market indexed liquidity is shown under Markets."
          >
            The deployed Exchange is a central limit order book with on-chain settlement. There is
            no AMM pool or liquidity knob to manage.
          </Unavailable>
        </div>
      );
    default:
      return <Trades />;
  }
}

function Trades() {
  const query = useAdminSnapshot("Trading");
  return (
    <div className="adm-stack">
      <PageHeader
        title="Trades"
        subtitle="Finalized Exchange executions on Base Mainnet, most recent 50."
      />
      <Loaded query={query} label="trades">
        {(snapshot) => {
          const trades = snapshot.rows.map(parseTradeRow);
          return (
            <Card flush>
              {trades.length === 0 ? (
                <div className="adm-card-body">
                  <p className="adm-muted" style={{ margin: 0 }}>
                    No finalized trades have been indexed yet.
                  </p>
                </div>
              ) : (
                <div className="adm-table-wrap">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Market</th>
                        <th>Outcome</th>
                        <th className="num">Shares</th>
                        <th className="num">Price</th>
                        <th className="num">USDC</th>
                        <th>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t) => (
                        <tr key={t.id}>
                          <td>{formatTimestamp(t.timestamp) ?? "Unavailable"}</td>
                          <td className="adm-mono">{t.market}</td>
                          <td>{t.outcomeIndex ?? "Unavailable"}</td>
                          <td className="num">{atomicToDecimal(t.sharesAtomic, 6, 4) ?? "Unavailable"}</td>
                          <td className="num">{priceToCents(t.priceAtomic) ?? "Unavailable"}</td>
                          <td className="num">{atomicToDecimal(t.usdcAtomic) ?? "Unavailable"}</td>
                          <td>{t.txHash ? <TxLink hash={t.txHash} /> : "Unavailable"}</td>
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
      <Notice>
        Only finalized, indexed executions appear. This is a bounded recent view, not a complete
        export, and it never includes pending or unconfirmed transactions.
      </Notice>
    </div>
  );
}
