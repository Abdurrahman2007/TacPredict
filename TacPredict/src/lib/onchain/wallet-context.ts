import { createContext } from "react";
import type { WalletState } from "./wallet";
export const BaseWalletContext = createContext<WalletState | null>(null);
