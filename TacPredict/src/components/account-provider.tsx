import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProtocolUser } from "@/lib/protocol/use-auth-user";
import { accountApi } from "@/lib/accounts/client";
import { REF_STORAGE, referralCode } from "@/lib/accounts/rules.mjs";
function capture() {
  try {
    const saved = JSON.parse(localStorage.getItem(REF_STORAGE) || "null") as {
      code: string;
      at: number;
    } | null;
    if (saved && Date.now() - saved.at < 30 * 86400000 && referralCode(saved.code))
      return saved.code;
    const code = referralCode(new URL(location.href).searchParams.get("ref"));
    if (code) {
      localStorage.setItem(REF_STORAGE, JSON.stringify({ code, at: Date.now() }));
      return code;
    }
    localStorage.removeItem(REF_STORAGE);
  } catch {
    /* private browsing */
  }
  return null;
}
function useAccountState() {
  const auth = useProtocolUser();
  useEffect(() => {
    capture();
  }, []);
  const query = useQuery({
    queryKey: ["account-profile", auth.user?.id ?? "guest"],
    enabled: Boolean(auth.ready && auth.user),
    retry: 1,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const data = await accountApi("/bootstrap", { ref: capture() });
      try {
        localStorage.removeItem(REF_STORAGE);
      } catch {
        /* optional storage */
      }
      return data;
    },
  });
  return { auth, query };
}
type AccountState = ReturnType<typeof useAccountState>;
const Context = createContext<AccountState | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
  const state = useAccountState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useAccount() {
  const value = useContext(Context);
  if (!value) throw Error("Account provider missing");
  return value;
}
