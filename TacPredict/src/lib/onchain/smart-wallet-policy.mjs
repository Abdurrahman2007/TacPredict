/**
 * Rules for signing in with a smart-contract wallet (Base Account, Coinbase Smart Wallet, Safe).
 *
 * A normal wallet signs with one key, so the sign-in service can check the 65-byte signature itself. A smart wallet
 * answers with a longer proof that only the wallet's contract can judge (ERC-1271, or ERC-6492 before the wallet is
 * deployed), so the server asks Base to judge it. Everything that does not need the network lives here and runs in a
 * plain node test.
 */

/** Sign-in messages are short-lived: the page asks for 10 minutes; the server never accepts more than this. */
export const SIGN_IN_MAX_LIFE_SEC = 900;
/** How far a wallet clock may run ahead of the server. */
export const CLOCK_SKEW_SEC = 120;
/** The statement the page puts in every sign-in message; the server refuses messages written for something else. */
export const SIGN_IN_STATEMENT_PREFIX = "Sign in to TacPredict.";
/** Accounts made for smart wallets use an address on the site's own domain that nobody can receive mail for. */
export const WALLET_EMAIL_DOMAIN = "tacpredict.fun";
export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_SIGNATURE_CHARS = 16_000;

const ADDRESS = /^0x[0-9a-f]{40}$/i;

/** A plain 65-byte wallet signature, which the sign-in service can verify on its own. */
export function isPlainSignature(signature) {
  return typeof signature === "string" && /^0x[0-9a-f]{130}$/i.test(signature);
}

/** Any hex proof a wallet may return: plain, ERC-1271 or ERC-6492. */
export function isSignatureShape(signature) {
  return (
    typeof signature === "string" &&
    signature.length >= 132 &&
    signature.length <= MAX_SIGNATURE_CHARS &&
    /^0x(?:[0-9a-f]{2})+$/i.test(signature)
  );
}

/** The one account every sign-in of this wallet lands in. */
export function walletEmail(address) {
  if (typeof address !== "string" || !ADDRESS.test(address))
    throw new Error("Invalid wallet address");
  return `wallet-${address.slice(2).toLowerCase()}@${WALLET_EMAIL_DOMAIN}`;
}

/** What the server writes into the account (service-role only; people cannot edit app_metadata). */
export function walletAppMetadata(address) {
  return { wallet_address: address.toLowerCase(), wallet_auth: "smart" };
}

/**
 * A wallet may already be linked to another account (the owner's own email account, for instance). That must not lock
 * the wallet out: it signs in to its own wallet account and simply does not take over the existing link.
 */
export function linkDecision(holderUserId, userId) {
  if (!holderUserId) return "link";
  return holderUserId === userId ? "link" : "keep";
}

/**
 * Does a verified session token say it belongs to this wallet? Only the server writes `app_metadata`, after checking
 * the wallet's signature, so on-chain actions for that wallet need no second proof.
 */
export function claimsOwnWallet(claims, address) {
  if (!claims || typeof claims !== "object" || typeof address !== "string") return false;
  if (!ADDRESS.test(address)) return false;
  const app = claims.app_metadata;
  if (!app || typeof app !== "object") return false;
  return (
    app.wallet_auth === "smart" &&
    typeof app.wallet_address === "string" &&
    app.wallet_address.toLowerCase() === address.toLowerCase()
  );
}

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

/**
 * Is this parsed sign-in message one the page could have written, for this site, right now?
 * `fields` is what `parseSiweMessage` returns; `hosts` are the host names the request arrived on.
 */
export function checkSignInMessage({ fields, hosts, nowMs }) {
  if (!fields || typeof fields !== "object") return { ok: false, reason: "bad_message" };
  const { address, domain, version, nonce, chainId, statement } = fields;
  if (typeof address !== "string" || !ADDRESS.test(address))
    return { ok: false, reason: "bad_message" };
  if (version !== "1") return { ok: false, reason: "bad_message" };
  if (typeof nonce !== "string" || !/^[a-zA-Z0-9]{8,}$/.test(nonce))
    return { ok: false, reason: "bad_message" };
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return { ok: false, reason: "bad_message" };
  if (typeof statement !== "string" || !statement.startsWith(SIGN_IN_STATEMENT_PREFIX))
    return { ok: false, reason: "bad_message" };
  const allowed = (hosts ?? [])
    .filter((h) => typeof h === "string" && h.length > 0)
    .map((h) => h.toLowerCase());
  if (typeof domain !== "string" || !allowed.includes(domain.toLowerCase()))
    return { ok: false, reason: "wrong_site" };

  const issued = toMs(fields.issuedAt);
  const expires = toMs(fields.expirationTime);
  if (!Number.isFinite(issued) || !Number.isFinite(expires))
    return { ok: false, reason: "bad_message" };
  if (expires <= nowMs) return { ok: false, reason: "expired" };
  if (issued > nowMs + CLOCK_SKEW_SEC * 1000) return { ok: false, reason: "bad_message" };
  if (expires - issued > SIGN_IN_MAX_LIFE_SEC * 1000) return { ok: false, reason: "bad_message" };
  if (fields.notBefore !== undefined) {
    const notBefore = toMs(fields.notBefore);
    if (!Number.isFinite(notBefore) || notBefore > nowMs + CLOCK_SKEW_SEC * 1000)
      return { ok: false, reason: "bad_message" };
  }
  return { ok: true, address: address.toLowerCase() };
}

/** Person-facing words for a refusal; `detail` is the short technical step that failed, when the server has one. */
export function signInReasonText(reason, detail) {
  const text = baseReasonText(reason);
  const extra = typeof detail === "string" ? detail.trim().slice(0, 120) : "";
  return extra ? `${text} (${extra})` : text;
}

function baseReasonText(reason) {
  switch (reason) {
    case "expired":
      return "The sign-in request expired. Please try again.";
    case "wrong_site":
      return "This sign-in request was made for another site.";
    case "bad_signature":
      return "Your wallet's signature could not be verified. Please try again.";
    case "address_taken":
      return "This wallet is already linked to another account.";
    case "unavailable":
      return "Wallet sign-in is unavailable right now. Please try again shortly.";
    default:
      return "Verification was not completed. Please try again.";
  }
}
