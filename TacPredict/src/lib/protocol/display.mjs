/**
 * Display helpers for public screens. Unknown or not-yet-indexed numbers render as a plain zero
 * (or the real figure when we have one) — never as "-", "--", "—" or "0.000000".
 */
const SIX = 1_000_000n;

function toBigInt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value >= 0n ? value : null;
  const text = typeof value === "number" ? (Number.isFinite(value) ? String(Math.trunc(value)) : "") : String(value);
  return /^\d+$/.test(text) ? BigInt(text) : null;
}

function group(whole) {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Six-decimal USDC atomic amount -> "$0", "$592", "$1,234.56", "$1.25M". Unknown -> "$0". */
export function usdcShort(atomic) {
  const n = toBigInt(atomic);
  if (n === null || n === 0n) return "$0";
  const whole = n / SIX;
  if (whole >= 1_000_000n) {
    const hundredths = (whole * 100n) / 1_000_000n;
    const text = `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}`.replace(/\.?0+$/, "");
    return `$${text}M`;
  }
  const cents = (n % SIX) / 10_000n;
  if (cents === 0n) return n < SIX ? "$0" : `$${group(whole)}`;
  return `$${group(whole)}.${cents.toString().padStart(2, "0")}`;
}

/** Plain-number dollars (already converted) -> same style as usdcShort. */
export function dollarsShort(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "$0";
  return usdcShort(BigInt(Math.round(value * 100)) * 10_000n);
}

/** Outcome probability as whole percent. Unknown -> "0%". */
export function pct(outcome) {
  if (!outcome || outcome.probabilityKnown === false) return "0%";
  const value = Number(outcome.probability);
  return `${Number.isFinite(value) ? Math.round(value) : 0}%`;
}

/** Outcome price in cents (a $1 share). Unknown -> "0¢". */
export function cents(outcome) {
  if (!outcome || outcome.probabilityKnown === false) return "0¢";
  const value = Number(outcome.probability);
  return `${Number.isFinite(value) ? Math.round(value) : 0}¢`;
}

/** "$1,234 Vol" style volume text from a market volume string that may be a placeholder. */
export function volumeText(volume) {
  if (typeof volume !== "string") return "$0";
  const text = volume.trim();
  if (!text || /^[-–—\s]+$/.test(text)) return "$0";
  return text;
}

/** Share amounts: six-decimal atomic -> up to 2 decimals, trailing zeros trimmed. Unknown -> "0". */
export function sharesShort(atomic) {
  const n = toBigInt(atomic);
  if (n === null || n === 0n) return "0";
  const whole = n / SIX;
  const hundredths = (n % SIX) / 10_000n;
  return hundredths === 0n ? group(whole) : `${group(whole)}.${hundredths.toString().padStart(2, "0")}`.replace(/0$/, "");
}
