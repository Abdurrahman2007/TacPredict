import { Wallet, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { shortAddress } from "@/lib/onchain/base";
import { Link } from "@tanstack/react-router";

export function ConnectWallet({ className }: { className?: string }) {
  const wallet = useBaseWallet();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (wallet.address) setOpen(false);
  }, [wallet.address]);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={className}>
          <Wallet className="size-4" />
          Connect wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle>Connect to TacPredict</DialogTitle>
          <DialogDescription>
            Base · native USDC. Connection is read-only: no signature, approval or transfer is
            requested.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {wallet.wallets.length ? (
            wallet.wallets.map((item) => (
              <Button
                key={item.id}
                variant="outline"
                disabled={wallet.busy}
                className="h-14 w-full justify-between rounded-xl"
                onClick={async () => {
                  await wallet.connect(item);
                }}
              >
                <span className="flex items-center gap-3">
                  <Wallet className="size-5" />
                  {item.name}
                </span>
                <ExternalLink className="size-4" />
              </Button>
            ))
          ) : (
            <p className="rounded-xl border border-border bg-secondary/30 p-4 text-sm leading-relaxed text-muted-foreground">
              No browser wallet detected. Open this app in a wallet’s browser or enable an injected
              wallet extension. WalletConnect QR support is not configured yet.
            </p>
          )}
          {wallet.error && (
            <p role="alert" className="text-sm text-destructive">
              {wallet.error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
