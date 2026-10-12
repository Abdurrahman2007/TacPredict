import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionMatchesWallet } from "../../src/lib/onchain/wallet-session.mjs";
const address = "0x57828f1aa32fd6be3988f240068df53ed94b7aef";
const session = (provider, data) => ({
  expires_at: 200,
  user: { identities: [{ provider, identity_data: data }] },
});
test("valid server wallet identity survives reconnect", () =>
  assert.equal(sessionMatchesWallet(session("ethereum", { address }), address, 100), true));
test("qualified SIWE identity matches same account", () =>
  assert.equal(
    sessionMatchesWallet(
      session("web3", { sub: `eip155:8453:${address}` }),
      address.toUpperCase().replace("0X", "0x"),
      100,
    ),
    true,
  ));
test("expired or unrelated identity requires sign in", () => {
  assert.equal(sessionMatchesWallet(session("google", { address }), address, 100), false);
  assert.equal(sessionMatchesWallet(session("ethereum", { address }), address, 300), false);
  assert.equal(
    sessionMatchesWallet(
      session("ethereum", { address: "0x0000000000000000000000000000000000000001" }),
      address,
      100,
    ),
    false,
  );
});
test("editable metadata is not wallet ownership proof", () =>
  assert.equal(
    sessionMatchesWallet({ expires_at: 200, user: { user_metadata: { address } } }, address, 100),
    false,
  ));
