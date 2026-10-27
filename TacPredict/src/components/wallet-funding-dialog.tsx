import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
/** Compatibility shell for old links. No wallet transfer/deposit implementation. */
export function WalletFundingDialog({
  open,
  onClose,
}: {
  kind: "deposit" | "withdraw";
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="login-popup grid-cols-1 w-[calc(100%_-_2rem)] max-w-sm rounded-3xl">
        <DialogTitle>Virtual USDC only</DialogTitle>
        <DialogDescription>
          Non-redeemable virtual trading units. No deposits, withdrawals or conversion to real
          assets.
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
