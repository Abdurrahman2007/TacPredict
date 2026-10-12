import { createContext, useContext } from "react";

/** True only after Wagmi + RainbowKit providers have mounted on the client. */
export const Web3ReadyContext = createContext(false);

export function useWeb3Ready() {
  return useContext(Web3ReadyContext);
}
