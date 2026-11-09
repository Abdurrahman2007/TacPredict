import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOCK_SKEW_SEC,
  SIGN_IN_MAX_LIFE_SEC,
  checkSignInMessage,
  isPlainSignature,
  isSignatureShape,
  signInReasonText,
  walletAppMetadata,
  walletEmail,
} from "../../src/lib/onchain/smart-wallet-policy.mjs";
import { sessionMatchesWallet } from "../../src/lib/onchain/wallet-session.mjs";

const ADDRESS = "0x57828f1aa32fd6be3988f240068df53ed94b7aef";
const NOW = Date.parse("2026-11-08T12:00:00Z");
const fields = (extra = {}) => ({
  address: "0x57828F1aA32fd6bE3988F240068DF53ED94b7AeF",
  domain: "tacpredict.fun",
  version: "1",
  nonce: "abcdEFGH12345678",
  chainId: 8453,
  statement:
    "Sign in to TacPredict. This signature does not authorize transactions or token transfers.",
  issuedAt: new Date(NOW - 5_000),
  notBefore: new Date(NOW - 35_000),
  expirationTime: new Date(NOW + 595_000),
  ...extra,
});
const check = (extra, hosts = ["tacpredict.fun"]) =>
  checkSignInMessage({ fields: fields(extra), hosts, nowMs: NOW });

test("a message the page wrote for this site is accepted and the address is lower-cased", () => {
  assert.deepEqual(check({}), { ok: true, address: ADDRESS });
});

test("the message must name the site the request arrived on", () => {
  assert.deepEqual(check({ domain: "evil.example" }), { ok: false, reason: "wrong_site" });
  assert.deepEqual(check({}, ["www.tacpredict.fun"]), { ok: false, reason: "wrong_site" });
  assert.equal(check({ domain: "TacPredict.fun" }, ["tacpredict.fun"]).ok, true);
  assert.deepEqual(check({ domain: undefined }), { ok: false, reason: "wrong_site" });
});

test("expired, far-future and over-long messages are refused", () => {
  assert.deepEqual(check({ expirationTime: new Date(NOW - 1) }), { ok: false, reason: "expired" });
  assert.deepEqual(check({ issuedAt: new Date(NOW + (CLOCK_SKEW_SEC + 5) * 1000) }), {
    ok: false,
    reason: "bad_message",
  });
  assert.deepEqual(check({ expirationTime: new Date(NOW + 3_600_000) }), {
    ok: false,
    reason: "bad_message",
  });
  // Never valid for longer than the cap, even when the window starts now.
  assert.deepEqual(
    check({
      issuedAt: new Date(NOW),
      expirationTime: new Date(NOW + (SIGN_IN_MAX_LIFE_SEC + 1) * 1000),
    }),
    { ok: false, reason: "bad_message" },
  );
  assert.equal(
    check({ issuedAt: new Date(NOW), expirationTime: new Date(NOW + SIGN_IN_MAX_LIFE_SEC * 1000) })
      .ok,
    true,
  );
  assert.deepEqual(check({ expirationTime: undefined }), { ok: false, reason: "bad_message" });
  assert.deepEqual(check({ notBefore: new Date(NOW + 3_600_000) }), {
    ok: false,
    reason: "bad_message",
  });
});

test("only the TacPredict sign-in statement is accepted", () => {
  assert.deepEqual(check({ statement: "Approve a transfer of everything you own." }), {
    ok: false,
    reason: "bad_message",
  });
  assert.deepEqual(check({ statement: undefined }), { ok: false, reason: "bad_message" });
});

test("malformed fields are refused", () => {
  assert.equal(check({ address: "0x123" }).ok, false);
  assert.equal(check({ version: "2" }).ok, false);
  assert.equal(check({ nonce: "short" }).ok, false);
  assert.equal(check({ chainId: 0 }).ok, false);
  assert.equal(
    checkSignInMessage({ fields: null, hosts: ["tacpredict.fun"], nowMs: NOW }).ok,
    false,
  );
});

test("signature shapes: plain 65-byte signatures stay with Supabase, longer proofs go to the server", () => {
  const plain = `0x${"ab".repeat(65)}`;
  const smart = `0x${"cd".repeat(400)}`;
  assert.equal(isPlainSignature(plain), true);
  assert.equal(isPlainSignature(smart), false);
  assert.equal(isSignatureShape(plain), true);
  assert.equal(isSignatureShape(smart), true);
  assert.equal(isSignatureShape("0x12"), false);
  assert.equal(isSignatureShape(`0x${"a".repeat(131)}`), false);
  assert.equal(isSignatureShape(`0x${"ab".repeat(20_000)}`), false);
  assert.equal(isSignatureShape(undefined), false);
  assert.equal(isSignatureShape("not hex"), false);
});

test("one stable account per wallet", () => {
  assert.equal(
    walletEmail("0x57828F1aA32fd6bE3988F240068DF53ED94b7AeF"),
    `wallet-${ADDRESS.slice(2)}@tacpredict.fun`,
  );
  assert.equal(walletEmail(ADDRESS), walletEmail(ADDRESS.toUpperCase().replace("0X", "0x")));
  assert.throws(() => walletEmail("nope"));
  assert.deepEqual(walletAppMetadata("0x57828F1aA32fd6bE3988F240068DF53ED94b7AeF"), {
    wallet_address: ADDRESS,
    wallet_auth: "smart",
  });
});

test("a smart-wallet session counts for its own wallet only, and never from editable metadata", () => {
  const expires = NOW / 1000 + 3600;
  const smart = {
    expires_at: expires,
    user: { app_metadata: walletAppMetadata(ADDRESS), identities: [] },
  };
  assert.equal(sessionMatchesWallet(smart, ADDRESS, NOW / 1000), true);
  assert.equal(
    sessionMatchesWallet(smart, ADDRESS.toUpperCase().replace("0X", "0x"), NOW / 1000),
    true,
  );
  assert.equal(sessionMatchesWallet(smart, "0x1043…7515", NOW / 1000), false);
  assert.equal(sessionMatchesWallet(smart, `0x${"1".repeat(40)}`, NOW / 1000), false);
  assert.equal(
    sessionMatchesWallet({ ...smart, expires_at: NOW / 1000 - 1 }, ADDRESS, NOW / 1000),
    false,
  );
  const edited = {
    expires_at: expires,
    user: { user_metadata: walletAppMetadata(ADDRESS), app_metadata: {}, identities: [] },
  };
  assert.equal(sessionMatchesWallet(edited, ADDRESS, NOW / 1000), false);
  const wrongKind = {
    expires_at: expires,
    user: { app_metadata: { wallet_address: ADDRESS }, identities: [] },
  };
  assert.equal(sessionMatchesWallet(wrongKind, ADDRESS, NOW / 1000), false);
});

test("a normal wallet's Web3 identity still matches", () => {
  const session = {
    expires_at: NOW / 1000 + 3600,
    user: { identities: [{ provider: "web3", identity_data: { address: ADDRESS } }] },
  };
  assert.equal(sessionMatchesWallet(session, ADDRESS, NOW / 1000), true);
  assert.equal(sessionMatchesWallet(session, `0x${"2".repeat(40)}`, NOW / 1000), false);
});

test("a refusal can carry the failing step so it can be traced", () => {
  assert.match(
    signInReasonText("unavailable", "link: rate limit"),
    /unavailable.*\(link: rate limit\)/i,
  );
  assert.equal(signInReasonText("expired"), signInReasonText("expired", ""));
  assert.ok(signInReasonText("unavailable", "x".repeat(500)).length < 200);
});

test("refusals read in plain words", () => {
  for (const reason of [
    "expired",
    "wrong_site",
    "bad_signature",
    "address_taken",
    "unavailable",
    "bad_message",
  ])
    assert.ok(signInReasonText(reason).length > 10);
});
