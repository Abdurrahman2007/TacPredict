export const SUSPEND_FOR: string;
export type AdminUser = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  providers: string[];
  suspended: boolean;
  isAdmin: boolean;
  wallets: string[];
  openPositions: number;
};
export function isUuid(value: unknown): value is string;
export function isBanned(bannedUntil: string | null | undefined, now?: number): boolean;
export function shapeUsers(input: {
  users: {
    id: string;
    email?: string | undefined;
    created_at?: string | undefined;
    last_sign_in_at?: string | undefined;
    banned_until?: string | undefined;
    app_metadata?: { providers?: string[] | undefined } | undefined;
  }[];
  adminIds: string[];
  wallets: { id: string; address: string; user_id: string | null; verified_at: string | null }[];
  openByWallet: Map<string, number>;
  now?: number;
}): AdminUser[];
export function suspendRefusal(input: {
  actorId: string;
  targetId: string;
  targetIsAdmin: boolean;
  suspend: boolean;
}): string | null;
export function adminRoleRefusal(input: {
  actorId: string;
  targetId: string;
  makeAdmin: boolean;
  adminIds: string[];
  targetSuspended: boolean;
}): string | null;
export function matchesUserSearch(user: AdminUser, text: string): boolean;
