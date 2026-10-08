import { useContext } from "react";
import { BaseWalletContext } from "./wallet-context";
export function useBaseWallet() {
  const value = useContext(BaseWalletContext);
  if (!value) throw new Error("Base wallet provider missing");
  return value;
}
