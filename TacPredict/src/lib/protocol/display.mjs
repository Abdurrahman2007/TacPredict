/** Exact source-derived display values. Missing data is unavailable, never fabricated zero. */
const SIX = 1_000_000n;

function toBigInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value >= 0n ? value : null;
  const text =
    typeof value === "number" ? (Number.isSafeInteger(value) ? String(value) : "") : String(value);
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

function group(whole) {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Six-decimal USDC atomic amount -> "$0", "$592", "$1,234.56", "$1.25M". Unknown -> "Unavailable". */
export function usdcShort(atomic) {
  const n = toBigInt(atomic);
  if (n === null) return "Unavailable";
  if (n === 0n) return "$0";
  const whole = n / SIX;
  if (whole >= 1_000_000n) {
    const hundredths = (whole * 100n) / 1_000_000n;
    const text = `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`.replace(
      /\.?0+$/,
      "",
    );
    return `$${text}M`;
  }
  const cents = (n % SIX) / 10_000n;
  if (cents === 0n) return n < SIX ? "<$0.01" : `$${group(whole)}`;
  return `$${group(whole)}.${cents.toString().padStart(2, "0")}`;
}

/** Plain-number dollars (already converted) -> same style as usdcShort. */
export function dollarsShort(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "Unavailable";
  if (value > 0 && value < 0.01) return "<$0.01";
  return usdcShort(BigInt(Math.round(value * 100)) * 10_000n);
}

/** Outcome probability as whole percent. Unknown -> "Unavailable". */
export function pct(outcome) {
  if (!outcome || outcome.probabilityKnown === false) return "Unavailable";
  const value = outcome.probability;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
    return "Unavailable";
  return `${Number.isFinite(value) ? Math.round(value) : 0}%`;
}

/** Outcome price in cents (a $1 share). Unknown -> "Unavailable". */
export function cents(outcome) {
  if (!outcome || outcome.probabilityKnown === false) return "Unavailable";
  const value = outcome.probability;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)
    return "Unavailable";
  return `${Number.isFinite(value) ? Math.round(value) : 0}¢`;
}

/** "$1,234 Vol" style volume text from a market volume string that may be a placeholder. */
export function volumeText(volume) {
  if (typeof volume !== "string") return "Unavailable";
  const text = volume.trim();
  if (!text || /^[-–—\s]+$/.test(text)) return "Unavailable";
  return text;
}

/** Share amounts: six-decimal atomic -> up to 2 decimals, trailing zeros trimmed. Unknown -> "Unavailable". */
export function sharesShort(atomic) {
  const n = toBigInt(atomic);
  if (n === null) return "Unavailable";
  if (n === 0n) return "0";
  const whole = n / SIX;
  const hundredths = (n % SIX) / 10_000n;
  return hundredths === 0n
    ? group(whole)
    : `${group(whole)}.${hundredths.toString().padStart(2, "0")}`.replace(/0$/, "");
}
