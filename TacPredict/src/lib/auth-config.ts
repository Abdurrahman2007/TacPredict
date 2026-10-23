// Feature flags describe provider readiness, never credentials.
export const authFeatures = {
  emailOtp: import.meta.env["VITE_EMAIL_OTP_ENABLED"] === "true",
  x: import.meta.env["VITE_X_AUTH_ENABLED"] === "true",
  google: import.meta.env["VITE_GOOGLE_AUTH_ENABLED"] === "true",
};
export type AuthNext = "/" | "/rewards" | "/profile" | "/account" | "/referrals";
export function safeAuthNext(value: unknown): AuthNext {
  return value === "/rewards" ||
    value === "/profile" ||
    value === "/account" ||
    value === "/referrals"
    ? value
    : "/";
}
