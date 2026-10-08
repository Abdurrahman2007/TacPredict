import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

// Farcaster custody signing is exchanged through Supabase's native Web3 verifier.
// FID/profile data is NOT trusted for roles or stored as authenticated identity.
export function FarcasterSignIn({
  disabled,
  compact = false,
  onBusyChange,
  onSuccess,
  onError,
}: {
  disabled: boolean;
  compact?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSuccess: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const cancel = () => {
    generation.current += 1;
    running.current = false;
    setBusy(false);
    setUrl("");
    setQr("");
  };
  const start = async () => {
    if (running.current) return;
    running.current = true;
    const version = ++generation.current;
    setBusy(true);
    onError("");
    const current = () => generation.current === version;
    try {
      if (!["tacpredict.fun", "www.tacpredict.fun"].includes(window.location.hostname))
        throw new Error("Farcaster sign-in is available on tacpredict.fun.");
      const sdk = import.meta.env.SSR ? null : await import("@farcaster/auth-client");
      if (!sdk) throw new Error("Farcaster sign-in needs a browser.");
      const { createAppClient, viemConnector } = sdk;
      const client = createAppClient({
        ethereum: viemConnector({ rpcUrl: "https://mainnet.optimism.io" }),
      });
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const domain = window.location.host;
      const uri = `${window.location.origin}/auth`;
      const deadline = Date.now() + 600_000;
      const channel = await client.createChannel({
        domain,
        siweUri: uri,
        nonce,
        notBefore: new Date(Date.now() - 30_000).toISOString(),
        expirationTime: new Date(deadline).toISOString(),
        acceptAuthAddress: false,
      });
      if (!current()) return;
      if (channel.isError) throw new Error("Could not open Farcaster sign-in. Please try again.");
      const target = new URL(channel.data.url);
      if (
        target.protocol !== "https:" ||
        !/(^|\.)(warpcast\.com|farcaster\.xyz)$/.test(target.hostname)
      )
        throw new Error("Farcaster returned an unexpected sign-in link.");
      if (channel.data.nonce !== nonce)
        throw new Error("Farcaster sign-in challenge did not match. Try again.");
      const qrCode = import.meta.env.SSR ? null : await import("qrcode");
      if (!qrCode) throw new Error("QR sign-in needs a browser.");
      const image = await qrCode.toDataURL(target.href, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      if (!current()) return;
      setUrl(target.href);
      setQr(image);
      while (current() && Date.now() < deadline) {
        const response = await client.status({ channelToken: channel.data.channelToken });
        if (!current()) return;
        if (response.isError)
          throw new Error("Farcaster sign-in could not be checked. Please try again.");
        if (response.data.state === "completed") {
          const { message, signature, authMethod } = response.data;
          if (!message || !signature || (authMethod && authMethod !== "custody"))
            throw new Error("Please sign in using your Farcaster custody wallet.");
          const proof = await client.verifySignInMessage({
            nonce,
            domain,
            message,
            signature,
            acceptAuthAddress: false,
          });
          if (!current()) return;
          if (
            proof.isError ||
            !proof.success ||
            proof.data.uri !== uri ||
            proof.authMethod !== "custody"
          )
            throw new Error("Farcaster signature could not be verified. Please try again.");
          const issuedAt = proof.data.issuedAt?.getTime() ?? NaN;
          const expiry = proof.data.expirationTime?.getTime() ?? NaN;
          if (
            !Number.isFinite(issuedAt) ||
            Math.abs(Date.now() - issuedAt) > 600_000 ||
            !Number.isFinite(expiry) ||
            Date.now() >= Math.min(expiry, deadline)
          )
            throw new Error("Farcaster sign-in expired. Please try again.");
          // Supabase independently verifies signature, production domain, URI and time.
          // A user-supplied FID can never grant privileges or replace the wallet subject.
          const { error } = await supabase.auth.signInWithWeb3({
            chain: "ethereum",
            message,
            signature,
          });
          if (error)
            throw new Error("Farcaster wallet sign-in failed. Please try wallet sign-in instead.");
          if (current()) {
            setUrl("");
            setQr("");
            await onSuccess();
          }
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
      }
      if (current()) throw new Error("Farcaster sign-in expired. Start again for a new QR code.");
    } catch (error) {
      if (current())
        onError(error instanceof Error ? error.message : "Farcaster sign-in failed. Try again.");
    } finally {
      if (current()) {
        running.current = false;
        setBusy(false);
        setUrl("");
        setQr("");
      }
    }
  };
  return (
    <div className={compact ? "min-w-0" : "mt-3"}>
      <Button
        variant="outline"
        aria-label="Continue with Farcaster"
        className={
          compact
            ? "h-14 w-full rounded-full border-white/35 bg-transparent text-base hover:bg-white/5"
            : "h-12 w-full rounded-full"
        }
        disabled={disabled || busy}
        onClick={() => void start()}
      >
        <span aria-hidden="true" className="text-2xl font-bold text-primary">
          ▥
        </span>
        {compact ? (
          <span className="sr-only">Farcaster</span>
        ) : busy ? (
          "Waiting…"
        ) : (
          "Continue with Farcaster"
        )}
      </Button>
      <Dialog
        open={busy}
        onOpenChange={(open) => {
          if (!open) cancel();
        }}
      >
        <DialogContent className="rounded-[28px] border-white/15 bg-[#111b29] text-center">
          <DialogTitle>Sign in with Farcaster</DialogTitle>
          <DialogDescription>
            Scan the QR code or open Farcaster to approve your sign-in.
          </DialogDescription>
          {qr && (
            <img
              src={qr}
              alt="Scan to sign in with Farcaster"
              className="mx-auto size-52 rounded-xl"
            />
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-sm font-medium text-primary"
            >
              Open Farcaster
            </a>
          )}
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Approve a sign-in message in Farcaster. Uses your custody-wallet account; no transaction
            or funds transfer. Expires in 10 minutes.
          </p>
          <button className="mt-3 text-sm text-muted-foreground" onClick={cancel}>
            Cancel sign-in
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
