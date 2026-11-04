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
import { InitialAvatar } from "./initial-avatar";
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

              <div className="account-group">
                <div className="account-setting">
                  <span>
                    <span className="account-tile tile-grey">
                      <EyeOff size={17} />
                    </span>
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
              </div>

              <p className="account-group-label">Trading</p>
              <div className="account-group">
                <div className="account-setting account-setting-stack">
                  <span>
                    <span className="account-tile tile-blue">
                      <Percent size={17} />
                    </span>
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
            </div>
          ) : (
            <>
              <div className="account-grabber" aria-hidden="true" />
              <div className="account-identity">
                <InitialAvatar seed={auth.user?.id ?? "tacpredict-guest"} size={48} label={username ?? "TacPredict"} />
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

              <p className="account-group-label">Account</p>
              <nav className="account-menu-list account-group" aria-label="Account">
                <Link to="/account" onClick={() => setOpen(false)}>
                  <span className="account-tile tile-blue">
                    <UserRound size={17} />
                  </span>
                  Profile
                  <ChevronRight size={15} />
                </Link>
                <Link to="/referrals" onClick={() => setOpen(false)}>
                  <span className="account-tile tile-green">
                    <Users size={17} />
                  </span>
                  Refer friend
                  <ChevronRight size={15} />
                </Link>
              </nav>

              <p className="account-group-label">Support</p>
              <nav className="account-menu-list account-group" aria-label="Support">
                <button type="button" onClick={() => setView("settings")}>
                  <span className="account-tile tile-grey">
                    <Settings2 size={17} />
                  </span>
                  Settings
                  <ChevronRight size={15} />
                </button>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Support"
                  onClick={() => setOpen(false)}
                >
                  <span className="account-tile tile-orange">
                    <LifeBuoy size={17} />
                  </span>
                  Help
                  <ChevronRight size={15} />
                </a>
                <Link to="/terms" onClick={() => setOpen(false)}>
                  <span className="account-tile tile-purple">
                    <FileText size={17} />
                  </span>
                  Terms
                  <ChevronRight size={15} />
                </Link>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Feedback"
                  onClick={() => setOpen(false)}
                >
                  <span className="account-tile tile-pink">
                    <MessageSquare size={17} />
                  </span>
                  Feedback
                  <ChevronRight size={15} />
                </a>
              </nav>

              {auth.user ? (
                <div className="account-group account-logout-group">
                  <button
                    type="button"
                    className="account-logout"
                    disabled={busy}
                    onClick={() => void logout()}
                  >
                    {busy ? "Logging out…" : "Log out"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="account-primary"
                  disabled={access.busy || access.restoring}
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
