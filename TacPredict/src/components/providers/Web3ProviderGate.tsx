import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Web3ReadyContext } from "./web3-ready";

type ProviderProps = {
  children: ReactNode;
  queryClient: QueryClient;
};

/**
 * SSR-safe gate: QueryClient only on the server / first paint,
 * then hydrate RainbowKit + Wagmi after the client mounts.
 */
export function Web3ProviderGate({ children, queryClient }: ProviderProps) {
  const [ClientProvider, setClientProvider] = useState<ComponentType<ProviderProps> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void import("./Web3Provider").then((mod) => {
      if (!cancelled) setClientProvider(() => mod.Web3Provider);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ClientProvider) {
    return (
      <Web3ReadyContext.Provider value={false}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </Web3ReadyContext.Provider>
    );
  }

  return (
    <Web3ReadyContext.Provider value={true}>
      <ClientProvider queryClient={queryClient}>{children}</ClientProvider>
    </Web3ReadyContext.Provider>
  );
}
