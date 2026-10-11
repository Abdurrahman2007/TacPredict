import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { BASE_NETWORK } from "@/lib/onchain/base";
import { usdcAtomic } from "@/lib/protocol/orders";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export function WalletFundingDialog({
  kind,
  open,
  onClose,
}: {
  kind: "deposit" | "withdraw";
  open: boolean;
  onClose: () => void;
}) {
  const wallet = useBaseWallet();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function withdraw() {
    if (!wallet.provider || !wallet.address || wallet.chainId !== BASE_NETWORK.id || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const { createPublicClient, createWalletClient, custom, isAddress, zeroAddress, parseAbi } =
        await import("viem");
      const { base } = await import("viem/chains");
      if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress)
        throw Error("Enter a valid receiving address");
      const value = usdcAtomic(amount);
      if (value <= 0n) throw Error("Enter a positive USDC amount");
      const account = wallet.address as `0x${string}`;
      const pub = createPublicClient({ chain: base, transport: custom(wallet.provider) });
      if ((await pub.getChainId()) !== 8453) throw Error("Switch to Base Mainnet");
      const abi = parseAbi([
        "function balanceOf(address) view returns(uint256)",
        "function transfer(address,uint256) returns(bool)",
      ]);
      const balance = await pub.readContract({
        address: USDC,
        abi,
        functionName: "balanceOf",
        args: [account],
      });
      if (balance < value) throw Error("Insufficient native Base USDC");
      const { request } = await pub.simulateContract({
        address: USDC,
        abi,
        functionName: "transfer",
        args: [recipient as `0x${string}`, value],
        account,
      });
      const wc = createWalletClient({ chain: base, transport: custom(wallet.provider), account });
      const hash = await wc.writeContract(request);
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw Error("Transfer reverted");
      setNotice("Confirmed on Base: " + hash);
      await wallet.refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="login-popup grid-cols-1 w-[calc(100%_-_2rem)] max-w-sm rounded-3xl">
        <DialogTitle>{kind === "deposit" ? "Add Base USDC" : "Send Base USDC"}</DialogTitle>
        <DialogDescription>
          Your wallet is self-custodial. This is not a deposit into a protocol vault.
        </DialogDescription>
        {kind === "deposit" ? (
          <>
            <p className="text-xs leading-6 text-muted-foreground">
              Send native USDC on Base to this wallet. Do not send on another network.
            </p>
            <p className="break-all rounded-xl bg-card p-4 text-sm">{wallet.address}</p>
            <button
              className="finance-pill finance-pill-primary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(wallet.address ?? "")
                  .then(() => setNotice("Address copied"))
                  .catch(() => setNotice("Copy failed"))
              }
            >
              Copy wallet address
            </button>
            <button
              className="finance-pill"
              disabled={wallet.busy}
              onClick={() => void wallet.refresh()}
            >
              Refresh balance
            </button>
          </>
        ) : (
          <>
            <label className="text-xs text-muted-foreground">
              Recipient
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                placeholder="0x…"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Amount · USDC
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                placeholder="0.00"
              />
            </label>
            <button
              className="finance-pill finance-pill-primary"
              disabled={busy || !amount || !recipient || wallet.chainId !== 8453}
              onClick={() => void withdraw()}
            >
              {busy ? "Awaiting wallet…" : "Review in wallet"}
            </button>
          </>
        )}
        <p role="status" className="break-all text-xs text-muted-foreground">
          {notice}
        </p>
      </DialogContent>
    </Dialog>
  );
}
