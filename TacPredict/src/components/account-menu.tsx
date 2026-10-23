import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  UserRound,
  LifeBuoy,
  Settings2,
  FileText,
  MessageSquare,
  LogOut,
  Gift,
  ChevronRight,
  EyeOff,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { PixelAvatar } from "./pixel-avatar";
import { useAccount } from "./account-provider";
import { useLoginDialog } from "./login-dialog";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { supabase } from "@/integrations/supabase/client";
import { useOverviewPrivacy } from "@/lib/accounts/privacy";
export function AccountMenu() {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<"menu" | "settings">("menu"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { auth, query } = useAccount(),
    wallet = useBaseWallet(),
    login = useLoginDialog(),
    cache = useQueryClient();
  const [hidden, setHidden] = useOverviewPrivacy();
  async function logout() {
    setBusy(true);
    setError("");
    const result = await supabase.auth.signOut({ scope: "local" });
    if (result.error) {
      setError("Could not log out. Try again.");
      setBusy(false);
      return;
    }
    try {
      const [{ disconnect }, { wagmiConfig }] = await Promise.all([
        import("@wagmi/core"),
        import("@/lib/web3/config"),
      ]);
      await disconnect(wagmiConfig);
    } catch {
      /* Auth is cleared even if the wallet transport has already disconnected. */
    }
    wallet.disconnect();
    cache.clear();
    setBusy(false);
    setOpen(false);
  }
  const username = query.data?.profile.username;
  return (
    <>
      <button
        className="account-menu-trigger"
        aria-label="Open account menu"
        onClick={() => {
          setView("menu");
          setOpen(true);
        }}
      >
        <MoreHorizontal size={21} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="account-sheet" aria-describedby="account-menu-description">
          <DialogTitle className="sr-only">
            {view === "settings" ? "Settings" : "Your account"}
          </DialogTitle>
          <DialogDescription id="account-menu-description" className="sr-only">
            Profile, referrals, support and account settings
          </DialogDescription>
          {view === "settings" ? (
            <>
              <button className="account-back" onClick={() => setView("menu")}>
                ← Account menu
              </button>
              <h2 className="account-section-title">Settings</h2>
              <div className="account-setting">
                <span>
                  <EyeOff size={19} />
                  <b>Hide overview balances</b>
                </span>
                <button
                  role="switch"
                  aria-label="Hide overview balances"
                  aria-checked={hidden}
                  className={`account-switch ${hidden ? "on" : ""}`}
                  onClick={() => setHidden(!hidden)}
                >
                  <i />
                </button>
              </div>
              <p className="account-helper">Applies to your Portfolio summary on this device.</p>
              <div className="account-setting">
                <span>
                  <Wallet size={19} />
                  <b>Network</b>
                </span>
                <span>Base Mainnet</span>
              </div>
            </>
          ) : (
            <>
              <div className="account-identity">
                <PixelAvatar seed={auth.user?.id ?? "tacpredict-guest"} size={52} />
                <div>
                  <b>
                    {username
                      ? "@" + username
                      : auth.user
                        ? "Your account"
                        : "Welcome to TacPredict"}
                  </b>
                  <span>
                    {auth.user ? "Your profile & rewards" : "Connect and sign in to get started"}
                  </span>
                </div>
              </div>
              <nav className="account-menu-list" aria-label="Account options">
                <Link to="/account" onClick={() => setOpen(false)}>
                  <UserRound size={20} />
                  Your Profile
                  <ChevronRight size={16} />
                </Link>
                <Link to="/referrals" onClick={() => setOpen(false)}>
                  <Gift size={20} />
                  Invite friends
                  <ChevronRight size={16} />
                </Link>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Support"
                  onClick={() => setOpen(false)}
                >
                  <LifeBuoy size={20} />
                  Help & Support
                  <ChevronRight size={16} />
                </a>
                <button onClick={() => setView("settings")}>
                  <Settings2 size={20} />
                  Settings
                  <ChevronRight size={16} />
                </button>
                <Link to="/terms" onClick={() => setOpen(false)}>
                  <FileText size={20} />
                  Terms & Conditions
                  <ChevronRight size={16} />
                </Link>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Feedback"
                  onClick={() => setOpen(false)}
                >
                  <MessageSquare size={20} />
                  Give feedback
                  <ChevronRight size={16} />
                </a>
              </nav>
              {auth.user ? (
                <button className="account-logout" disabled={busy} onClick={() => void logout()}>
                  <LogOut size={19} />
                  {busy ? "Logging out…" : "Log out"}
                </button>
              ) : (
                <button
                  className="account-primary"
                  onClick={() => {
                    setOpen(false);
                    login("/profile");
                  }}
                >
                  Connect wallet
                  <ChevronRight size={16} />
                </button>
              )}
              {error && (
                <p role="alert" className="account-error">
                  {error}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
