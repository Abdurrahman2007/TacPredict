import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  SUSPEND_FOR,
  adminRoleRefusal,
  shapeUsers,
  suspendRefusal,
  isBanned,
  type AdminUser,
} from "./admin-users.mjs";

const PER_PAGE = 200;
const MAX_PAGES = 5; // 1,000 accounts; the list says so when it is cut off
const db = () => supabaseAdmin as unknown as SupabaseClient;

/** Same bar as every other admin call: signed in, authenticator verified, assigned admin role. */
export async function requireAdmin(
  userClient: SupabaseClient,
  userId: string,
  aal: string | undefined,
) {
  if (aal !== "aal2") throw Error("Administrator authenticator verification required");
  const { data, error } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (error || !data?.length) throw Error("Only an assigned administrator may do this.");
}

async function adminIds(): Promise<string[]> {
  const { data, error } = await db().from("user_roles").select("user_id").eq("role", "admin");
  if (error) throw Error("Could not read admin roles.");
  return (data ?? []).map((r: { user_id: string }) => r.user_id);
}

async function audit(actor: string, action: string, target: string) {
  try {
    await db().from("protocol_audit_logs").insert({ actor, action, target });
  } catch {
    /* best effort: the action itself already succeeded */
  }
}

export async function loadUsers(): Promise<{ users: AdminUser[]; truncated: boolean }> {
  const accounts: Parameters<typeof shapeUsers>[0]["users"] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw Error("Could not read user accounts.");
    accounts.push(...data.users);
    if (data.users.length < PER_PAGE) break;
    if (page === MAX_PAGES) truncated = true;
  }
  async function wallets() {
    const all: {
      id: string;
      address: string;
      user_id: string | null;
      verified_at: string | null;
    }[] = [];
    for (let start = 0; start < 5000; start += 1000) {
      const r = await db()
        .from("protocol_wallets")
        .select("id,address,user_id,verified_at")
        .not("user_id", "is", null)
        .order("id")
        .range(start, start + 999)
        .abortSignal(AbortSignal.timeout(15000));
      if (r.error || !r.data) throw Error("Could not read wallet links.");
      all.push(...r.data);
      if (r.data.length < 1000) return { data: all };
    }
    throw Error("Wallet list exceeds safe limit.");
  }
  async function positions() {
    const all: { wallet_id: string }[] = [];
    for (let start = 0; start < 20000; start += 1000) {
      const r = await db()
        .from("protocol_positions")
        .select("id,wallet_id")
        .eq("status", "OPEN")
        .gt("shares_atomic", 0)
        .order("id")
        .range(start, start + 999)
        .abortSignal(AbortSignal.timeout(15000));
      if (r.error || !r.data) throw Error("Could not read position counts.");
      all.push(...r.data);
      if (r.data.length < 1000) return { data: all };
    }
    throw Error("Position list exceeds safe limit.");
  }
  const [admins, walletRes, positionRes] = await Promise.all([adminIds(), wallets(), positions()]);
  const openByWallet = new Map<string, number>();
  for (const p of (positionRes.data ?? []) as { wallet_id: string }[])
    openByWallet.set(p.wallet_id, (openByWallet.get(p.wallet_id) ?? 0) + 1);
  return {
    users: shapeUsers({
      users: accounts,
      adminIds: admins,
      wallets: (walletRes.data ?? []) as Parameters<typeof shapeUsers>[0]["wallets"],
      openByWallet,
    }),
    truncated,
  };
}

export async function changeSuspension(actorId: string, targetId: string, suspend: boolean) {
  const admins = await adminIds();
  const refusal = suspendRefusal({
    actorId,
    targetId,
    targetIsAdmin: admins.includes(targetId),
    suspend,
  });
  if (refusal) throw Error(refusal);
  const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
    ban_duration: suspend ? SUSPEND_FOR : "none",
  });
  if (error) throw Error("Could not change the account status.");
  await audit(actorId, suspend ? "ADMIN_USER_SUSPENDED" : "ADMIN_USER_RESTORED", targetId);
}

export async function changeAdminRole(actorId: string, targetId: string, makeAdmin: boolean) {
  const admins = await adminIds();
  const { data, error: readError } = await supabaseAdmin.auth.admin.getUserById(targetId);
  if (readError || !data.user) throw Error("User not found.");
  const refusal = adminRoleRefusal({
    actorId,
    targetId,
    makeAdmin,
    adminIds: admins,
    targetSuspended: isBanned(data.user.banned_until),
  });
  if (refusal) throw Error(refusal);
  const result = makeAdmin
    ? await db().from("user_roles").insert({ user_id: targetId, role: "admin" })
    : await db().from("user_roles").delete().eq("user_id", targetId).eq("role", "admin");
  if (result.error) throw Error("Could not change the admin role.");
  await audit(actorId, makeAdmin ? "ADMIN_ROLE_GRANTED" : "ADMIN_ROLE_REVOKED", targetId);
}
