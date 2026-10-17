/** Draft terms only. Does not invent prices, create contracts, sign, settle or enable trading. */
export function fiveMinuteTemplate(asset, now = Date.now()) {
  const product = asset === "bitcoin" ? "BTC-USD" : asset === "ethereum" ? "ETH-USD" : null;
  if (!product || !Number.isFinite(now)) throw Error("BTC or ETH and a valid clock required");
  // At least one full minute to review before the next five-minute UTC boundary.
  const start = Math.ceil((now + 120000) / 300000) * 300000,
    end = start + 300000;
  const iso = (t) => new Date(t).toISOString();
  const name = asset === "bitcoin" ? "Bitcoin" : "Ethereum";
  const rules = `UP wins if the close of the Coinbase Exchange ${product} 60-second candle starting at ${iso(end - 60000)} is greater than or equal to the open of the 60-second candle starting at ${iso(start)}. Otherwise DOWN wins. Window: [${iso(start)}, ${iso(end)}). Coinbase candle tuple is [time, low, high, open, close, volume], time in Unix seconds. Use exact UTC candle timestamps; do not substitute CoinGecko spot, another exchange or interpolated data. Missing, inconsistent or disputed source evidence must be reviewed under the native dispute/timeout-void rules; AI never chooses a winner. The resolver publishes independently reviewable evidence after close.`;
  return {
    title: `${name} Up or Down · 5 min · ${iso(start)}`,
    description: `A five-minute ${product} market using the Coinbase Exchange candles specified in the locked rules. Up includes equality. This is only prepared metadata until an authorized operator publishes the on-chain market.`,
    category: "Crypto",
    outcomes: "Up,Down",
    rules,
    source: `Coinbase Exchange ${product} 60-second candles`,
    sourceUrl: `https://api.exchange.coinbase.com/products/${product}/candles?granularity=60&start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(end))}`,
    times: {
      openAt: iso(start).slice(0, 16),
      closeAt: iso(end).slice(0, 16),
      resolveAfter: iso(end + 300000).slice(0, 16),
      resolutionDeadline: iso(end + 172800000).slice(0, 16),
    },
  };
}
