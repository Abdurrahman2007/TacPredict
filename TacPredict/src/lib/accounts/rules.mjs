export const REF_STORAGE = "tac-first-referral-v1";
export const HIDE_STORAGE = "tac-hide-overview-v1";
export function normalizeUsername(value) {
  const name = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(name))
    throw Error("Use 3–24 characters: letters, numbers and underscores. Start with a letter.");
  if (
    /^(admin|administrator|support|tacpredict|moderator|official|system|root|help|settings|referrals|wallet|trader)$/.test(
      name,
    )
  )
    throw Error("This username is reserved.");
  return name;
}
export function referralCode(value) {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  return /^[A-F0-9]{16}$/.test(code) ? code : null;
}
export function validSignup(createdAt, now = Date.now()) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && created <= now + 60000 && now - created <= 86400000;
}
