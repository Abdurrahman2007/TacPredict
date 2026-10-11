import { Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { shortAddress } from "@/lib/onchain/base";
import { useLoginDialog } from "./login-dialog";
import { Link } from "@tanstack/react-router";
/** A single authentication entry: wallet ownership is proven by the real AuthPanel. */
export function ConnectWallet({ className }: { className?: string }) {
  const wallet = useBaseWallet();
  const login = useLoginDialog();
  if (wallet.address)
    return (
      <Button variant="outline" className={className} asChild>
        <Link to="/profile">
          <Wallet className="size-4" />
          {shortAddress(wallet.address)}
        </Link>
      </Button>
    );
  return (
    <Button className={className} onClick={() => login("/profile")}>
      <Wallet className="size-4" />
      Connect wallet
    </Button>
  );
}
