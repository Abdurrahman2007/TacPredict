import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRequestWalletSignIn } from "../../src/lib/onchain/wallet-signin-policy.mjs";

test("a restored wallet connection on page load never opens a signature request", () => {
  for (const signedIn of [true, false])
    for (const alreadyAttempted of [true, false])
      assert.equal(
        shouldRequestWalletSignIn({ freshConnect: false, signedIn, alreadyAttempted }),
        "skip",
      );
});

test("a fresh connect without a matching session asks for one signature", () =>
  assert.equal(
    shouldRequestWalletSignIn({ freshConnect: true, signedIn: false, alreadyAttempted: false }),
    "sign",
  ));

test("a fresh connect with a matching session needs no signature", () =>
  assert.equal(
    shouldRequestWalletSignIn({ freshConnect: true, signedIn: true, alreadyAttempted: false }),
    "none",
  ));

test("a rejected signature is not requested again for the same connection", () =>
  assert.equal(
    shouldRequestWalletSignIn({ freshConnect: true, signedIn: false, alreadyAttempted: true }),
    "skip",
  ));
