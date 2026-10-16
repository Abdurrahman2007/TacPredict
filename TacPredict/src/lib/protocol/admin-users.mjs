/** Pure rules for administrator user control. No I/O, so every safety rule is unit-tested. */
export const SUSPEND_FOR = "876000h"; // about 100 years; lifted by setting "none"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

export function isBanned(bannedUntil, now = Date.now()) {
  if (!bannedUntil) return false;
  const until = Date.parse(bannedUntil);
  return Number.isFinite(until) && until > now;
}

/** Joins auth accounts with roles, verified wallets and open-position counts. Newest first. */
export function shapeUsers({ users, adminIds, wallets, openByWallet, now = Date.now() }) {
  const admins = new Set(adminIds);
  const byUser = new Map();
  for (const w of wallets) {
    if (!w.user_id || !w.verified_at) continue;
    const list = byUser.get(w.user_id) ?? [];
    list.push(w);
    byUser.set(w.user_id, list);
  }
  return users
    .map((u) => {
      const owned = byUser.get(u.id) ?? [];
      return {
        id: u.id,
        email: u.email ?? null,
        createdAt: u.created_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        providers: Array.isArray(u.app_metadata?.providers) ? u.app_metadata.providers : [],
        suspended: isBanned(u.banned_until, now),
        isAdmin: admins.has(u.id),
        wallets: owned.map((w) => w.address),
        openPositions: owned.reduce((sum, w) => sum + (openByWallet.get(w.id) ?? 0), 0),
      };
    })
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "") || 0);
}

/** Why a suspension change must be refused, or null when it is allowed. */
export function suspendRefusal({ actorId, targetId, targetIsAdmin, suspend }) {
  if (!isUuid(targetId)) return "Invalid user.";
  if (!suspend) return null;
  if (targetId === actorId) return "You cannot suspend your own account.";
  if (targetIsAdmin) return "Remove the admin role first, then suspend the account.";
  return null;
}

/** Why an admin-role change must be refused, or null when it is allowed. */
export function adminRoleRefusal({ actorId, targetId, makeAdmin, adminIds, targetSuspended }) {
  if (!isUuid(targetId)) return "Invalid user.";
  if (makeAdmin) {
    if (targetSuspended) return "Lift the suspension before making this account an admin.";
    return adminIds.includes(targetId) ? "This account is already an admin." : null;
  }
  if (!adminIds.includes(targetId)) return "This account is not an admin.";
  if (targetId === actorId) return "You cannot remove your own admin role.";
  if (adminIds.length <= 1) return "At least one admin must remain.";
  return null;
}

export function matchesUserSearch(user, text) {
  const needle = String(text ?? "").trim().toLowerCase();
  if (!needle) return true;
  return [user.email, user.id, ...user.wallets].some((v) => v && String(v).toLowerCase().includes(needle));
}
