import { atomicToDecimal, formatTimestamp, parseTradeRow, priceToCents } from "@/lib/protocol/admin-rows.mjs";
import { useAdminSnapshot } from "../admin-data";
import { Card, Loaded, PageHeader, TxLink } from "../admin-ui";

export function TradingView(_props: { view: string }) {
  return <Trades />;
}

function Trades() {
  const query = useAdminSnapshot("Trading");
  return (
    <div className="adm-stack">
      <PageHeader
        title="Trades"
        subtitle="Latest 50 confirmed trades on Base."
      />
      <Loaded query={query} label="trades">
        {(snapshot) => {
          const trades = snapshot.rows.map(parseTradeRow);
          return (
            <Card flush>
              {trades.length === 0 ? (
                <div className="adm-card-body">
                  <p className="adm-muted" style={{ margin: 0 }}>
                    No trades yet.
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
    </div>
  );
}
