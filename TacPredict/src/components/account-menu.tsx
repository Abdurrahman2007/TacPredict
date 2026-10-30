import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Menu,
  UserRound,
  LifeBuoy,
  Settings2,
  FileText,
  MessageSquare,
  LogOut,
  Users,
  ChevronRight,
  ChevronLeft,
  EyeOff,
  Percent,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { PixelAvatar } from "./pixel-avatar";
import { useAccount } from "./account-provider";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { supabase } from "@/integrations/supabase/client";
import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import {
  SLIPPAGE_PRESETS,
  formatSlippage,
  useTradeSlippage,
} from "@/lib/accounts/slippage";

export function AccountMenu() {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<"menu" | "settings">("menu"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { auth, query } = useAccount(),
    wallet = useBaseWallet(),
    access = useWalletAccess("/profile"),
    cache = useQueryClient();
  const [hidden, setHidden] = useOverviewPrivacy();
  const [slippage, setSlippage] = useTradeSlippage();

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
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setView("menu");
          setOpen(true);
        }}
      >
        <Menu size={20} strokeWidth={2.2} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="account-sheet" aria-describedby="account-menu-description">
          <DialogTitle className="sr-only">
            {view === "settings" ? "Settings" : "Menu"}
          </DialogTitle>
          <DialogDescription id="account-menu-description" className="sr-only">
            Profile, referrals, support and settings
          </DialogDescription>

          {view === "settings" ? (
            <div className="account-slide">
              <button type="button" className="account-back" onClick={() => setView("menu")}>
                <ChevronLeft size={18} />
                Menu
              </button>
              <h2 className="account-section-title">Settings</h2>

              <div className="account-setting">
                <span>
                  <EyeOff size={18} />
                  <b>Hide balances</b>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Hide overview balances"
                  aria-checked={hidden}
                  className={`account-switch ${hidden ? "on" : ""}`}
                  onClick={() => setHidden(!hidden)}
                >
                  <i />
                </button>
              </div>

              <div className="account-setting account-setting-stack">
                <span>
                  <Percent size={18} />
                  <b>Slippage</b>
                </span>
                <div className="account-slippage" role="group" aria-label="Slippage tolerance">
                  {SLIPPAGE_PRESETS.map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      className={slippage === bps ? "on" : undefined}
                      aria-pressed={slippage === bps}
                      onClick={() => setSlippage(bps)}
                    >
                      {formatSlippage(bps)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="account-identity">
                <PixelAvatar seed={auth.user?.id ?? "tacpredict-guest"} size={48} />
                <div>
                  <b>
                    {username
                      ? "@" + username
                      : auth.user
                        ? "Your account"
                        : "TacPredict"}
                  </b>
                  <span>{auth.user ? "Signed in" : "Guest"}</span>
                </div>
              </div>

              <nav className="account-menu-list" aria-label="Menu">
                <Link to="/account" onClick={() => setOpen(false)}>
                  <UserRound size={19} />
                  Profile
                  <ChevronRight size={15} />
                </Link>
                <Link to="/referrals" onClick={() => setOpen(false)}>
                  <Users size={19} />
                  Refer friend
                  <ChevronRight size={15} />
                </Link>
                <button type="button" onClick={() => setView("settings")}>
                  <Settings2 size={19} />
                  Settings
                  <ChevronRight size={15} />
                </button>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Support"
                  onClick={() => setOpen(false)}
                >
                  <LifeBuoy size={19} />
                  Help
                  <ChevronRight size={15} />
                </a>
                <Link to="/terms" onClick={() => setOpen(false)}>
                  <FileText size={19} />
                  Terms
                  <ChevronRight size={15} />
                </Link>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Feedback"
                  onClick={() => setOpen(false)}
                >
                  <MessageSquare size={19} />
                  Feedback
                  <ChevronRight size={15} />
                </a>
              </nav>

              {auth.user ? (
                <button
                  type="button"
                  className="account-logout"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  <LogOut size={18} />
                  {busy ? "Logging out…" : "Log out"}
                </button>
              ) : (
                <button
                  type="button"
                  className="account-primary"
                  disabled={access.busy}
                  onClick={() => {
                    if (access.state === "connect") setOpen(false);
                    void access.run();
                  }}
                >
                  {access.label || "Verify wallet"}
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
