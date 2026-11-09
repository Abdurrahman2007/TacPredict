export declare const SIGN_IN_MAX_LIFE_SEC: number;
export declare const CLOCK_SKEW_SEC: number;
export declare const SIGN_IN_STATEMENT_PREFIX: string;
export declare const WALLET_EMAIL_DOMAIN: string;
export declare const MAX_MESSAGE_CHARS: number;
export declare const MAX_SIGNATURE_CHARS: number;
export declare function isPlainSignature(signature: unknown): signature is string;
export declare function isSignatureShape(signature: unknown): signature is string;
export declare function walletEmail(address: string): string;
export declare function walletAppMetadata(address: string): {
  wallet_address: string;
  wallet_auth: "smart";
};
export type SignInCheck =
  | { ok: true; address: string }
  | { ok: false; reason: "bad_message" | "wrong_site" | "expired" };
export declare function checkSignInMessage(input: {
  fields: unknown;
  hosts: ReadonlyArray<string | null | undefined>;
  nowMs: number;
}): SignInCheck;
export declare function signInReasonText(reason: string): string;
