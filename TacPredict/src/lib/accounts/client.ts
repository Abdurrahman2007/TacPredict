import { supabase } from "@/integrations/supabase/client";
export type AccountData = {
  profile: {
    username: string;
    referralCode: string;
    status: string;
    createdAt: string;
    referredBy: string | null;
  };
  stats: { invited: number; earned: number; pending: number };
  referrals: { username: string; amount_units: number; status: string; created_at: string }[];
  policy: { enabled: number; reward_units: number; review_required: number };
};
export async function accountApi<T = AccountData>(path = "", data?: unknown): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw Error("Sign in with your wallet to continue");
  const response = await fetch("/api/account" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + token,
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Request failed. Please retry.");
  return result as T;
}
