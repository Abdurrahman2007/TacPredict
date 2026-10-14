/**
 * When may the app open a wallet signature request (SIWE)?
 *
 * - "skip": never prompt. Used when wagmi only restored an earlier connection on
 *   page load/reload, or when the person already rejected this connection.
 * - "none": freshly connected but already signed in; nothing to sign.
 * - "sign": the person connected a wallet in this page view and has no matching session.
 */
export function shouldRequestWalletSignIn({ freshConnect, signedIn, alreadyAttempted }) {
  if (!freshConnect) return "skip";
  if (signedIn) return "none";
  if (alreadyAttempted) return "skip";
  return "sign";
}
