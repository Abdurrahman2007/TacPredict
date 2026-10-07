import { BaseWalletContext as Context } from "./wallet-context";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BASE_NETWORK, balanceOfData, isAddress } from "./base";

export type WalletProvider = {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
};
export type WalletChoice = { id: string; name: string; provider: WalletProvider };
export type WalletState = {
  wallets: WalletChoice[];
  address: string | null;
  chainId: number | null;
  usdc: bigint | null;
  gasBalance: bigint | null;
  busy: boolean;
  error: string;
  connect: (wallet: WalletChoice) => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  switchToBase: () => Promise<void>;
};

const message = (error: unknown) => {
  const code = (error as { code?: number })?.code;
  return code === 4001
    ? "Wallet request cancelled."
    : "Wallet unavailable. Check your wallet and try again.";
};

export function BaseWalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<WalletChoice[]>([]);
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<bigint | null>(null);
  const [gasBalance, setGasBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const connectionLock = useRef(false);
  const identity = useRef("");
  const invalidate = useCallback(() => {
    revision.current += 1;
  }, []);

  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (
        event as CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: WalletProvider }>
      ).detail;
      if (!detail?.info?.uuid || !detail.provider?.request) return;
      const wallet = {
        id: detail.info.uuid,
        name: detail.info.name || "Browser wallet",
        provider: detail.provider,
      };
      setWallets((current) =>
        current.some((item) => item.id === wallet.id) ? current : [...current, wallet],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = (window as unknown as { ethereum?: WalletProvider }).ethereum;
    if (injected?.request)
      setWallets((current) =>
        current.length ? current : [{ id: "injected", name: "Browser wallet", provider: injected }],
      );
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  const sync = useCallback(async (wallet: WalletProvider) => {
    const version = ++revision.current;
    try {
      const [accounts, chain] = await Promise.all([
        wallet.request({ method: "eth_accounts" }),
        wallet.request({ method: "eth_chainId" }),
      ]);
      if (version !== revision.current) return;
      const selected = Array.isArray(accounts) && isAddress(accounts[0]) ? accounts[0] : null;
      const network =
        typeof chain === "string" && /^0x[0-9a-f]+$/i.test(chain)
          ? Number.parseInt(chain, 16)
          : null;
      const nextIdentity = `${selected ?? ""}:${network ?? ""}`;
      if (identity.current !== nextIdentity) {
        setUsdc(null);
        setGasBalance(null);
        identity.current = nextIdentity;
      }
      setAddress(selected);
      setChainId(network);
      if (!selected || network !== BASE_NETWORK.id) return;
      const [token, gas] = await Promise.all([
        wallet.request({
          method: "eth_call",
          params: [{ to: BASE_NETWORK.usdc, data: balanceOfData(selected) }, "latest"],
        }),
        wallet.request({ method: "eth_getBalance", params: [selected, "latest"] }),
      ]);
      if (version !== revision.current) return;
      if (typeof token !== "string" || !/^0x[0-9a-f]+$/i.test(token))
        throw new Error("Invalid token response");
      setUsdc(BigInt(token));
      if (typeof gas === "string" && /^0x[0-9a-f]+$/i.test(gas)) setGasBalance(BigInt(gas));
      setError("");
    } catch {
      if (version === revision.current)
        setError("Could not read the wallet balance. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    if (!provider) return;
    const changed = () => {
      void sync(provider);
    };
    const disconnected = () => {
      ++revision.current;
      setAddress(null);
      setChainId(null);
      setUsdc(null);
      setGasBalance(null);
    };
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", changed);
    provider.on?.("disconnect", disconnected);
    void sync(provider);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void sync(provider);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      invalidate();
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", changed);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider, sync, invalidate]);

  const connect = async (wallet: WalletChoice) => {
    if (connectionLock.current) return;
    connectionLock.current = true;
    setBusy(true);
    setError("");
    try {
      const accounts = await wallet.provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || !isAddress(accounts[0])) throw new Error("No wallet account");
      setAddress(accounts[0]);
      setProvider(wallet.provider);
      await sync(wallet.provider);
    } catch (e) {
      setError(message(e));
    } finally {
      connectionLock.current = false;
      setBusy(false);
    }
  };
  const disconnect = () => {
    ++revision.current;
    setProvider(null);
    setAddress(null);
    setChainId(null);
    setUsdc(null);
    setGasBalance(null);
    setError("");
  };
  const refresh = async () => {
    if (provider && !busy) {
      setBusy(true);
      try {
        await sync(provider);
      } finally {
        setBusy(false);
      }
    }
  };
  const switchToBase = async () => {
    if (!provider || busy) return;
    setBusy(true);
    setError("");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_NETWORK.hexId }],
      });
      await sync(provider);
    } catch (e) {
      setError(
        (e as { code?: number })?.code === 4902
          ? "Add Base to your wallet, then reconnect."
          : message(e),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Context.Provider
      value={{
        wallets,
        address,
        chainId,
        usdc,
        gasBalance,
        busy,
        error,
        connect,
        disconnect,
        refresh,
        switchToBase,
      }}
    >
      {children}
    </Context.Provider>
  );
}
