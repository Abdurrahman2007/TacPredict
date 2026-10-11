import { Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { shortAddress } from "@/lib/onchain/base";
import { Link } from "@tanstack/react-router";
import { useLoginDialog } from "@/components/login-dialog";

/** Opens Supabase Auth (AuthPanel). Does not raw-connect without sign-in. */
export function ConnectWallet({ className }: { className?: string }) {
  const wallet = useBaseWallet();
  const showLogin = useLoginDialog();
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
    <Button type="button" className={className} onClick={() => showLogin("/profile")}>
      <Wallet className="size-4" />
      Connect wallet
    </Button>
  );
}
