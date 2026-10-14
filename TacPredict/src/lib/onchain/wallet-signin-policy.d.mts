export function shouldRequestWalletSignIn(input: {
  freshConnect: boolean;
  signedIn: boolean;
  alreadyAttempted: boolean;
}): "skip" | "none" | "sign";
