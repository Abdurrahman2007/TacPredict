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
  Gift,
  Trophy,
  Pencil,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { InitialAvatar } from "./initial-avatar";
import { useAccount } from "./account-provider";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { supabase } from "@/integrations/supabase/client";
import { useOverviewPrivacy } from "@/lib/accounts/privacy";
import { SLIPPAGE_PRESETS, formatSlippage, useTradeSlippage } from "@/lib/accounts/slippage";

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
    if (wallet.address) {
      const { clearSiweAttempt } = await import("@/lib/onchain/siwe-attempt.mjs");
      clearSiweAttempt(wallet.address);
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
          <DialogTitle className="sr-only">{view === "settings" ? "Settings" : "Menu"}</DialogTitle>
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
              <div className="wm-identity">
                <InitialAvatar
                  seed={auth.user?.id ?? "tacpredict-guest"}
                  size={44}
                  label={username ?? "TacPredict"}
                />
                <div>
                  <b>{username ? "@" + username : auth.user ? "Your account" : "Guest"}</b>
                  <span>
                    {wallet.address
                      ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
                      : "Not connected"}
                  </span>
                </div>
                <Link
                  to="/account"
                  className="wm-edit"
                  aria-label="Edit profile"
                  onClick={() => setOpen(false)}
                >
                  <Pencil size={18} />
                </Link>
              </div>

              <nav className="wm-list" aria-label="Menu">
                <Link to="/account" onClick={() => setOpen(false)}>
                  <UserRound size={21} />
                  Your Profile
                </Link>
                <Link to="/rewards" onClick={() => setOpen(false)}>
                  <Gift size={21} />
                  Rewards
                </Link>
                <Link to="/ranking" onClick={() => setOpen(false)}>
                  <Trophy size={21} />
                  Ranking
                </Link>
                <Link to="/referrals" onClick={() => setOpen(false)}>
                  <Users size={21} />
                  Refer a friend
                </Link>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Feedback"
                  onClick={() => setOpen(false)}
                >
                  <MessageSquare size={21} />
                  Give feedback
                </a>
                <a
                  href="mailto:support@tacpredict.fun?subject=TacPredict%20Support"
                  onClick={() => setOpen(false)}
                >
                  <LifeBuoy size={21} />
                  Help &amp; Support
                </a>
                <Link to="/terms" onClick={() => setOpen(false)}>
                  <FileText size={21} />
                  Terms
                </Link>
                <button type="button" onClick={() => setView("settings")}>
                  <Settings2 size={21} />
                  Settings
                  <ChevronRight size={16} className="wm-chev" />
                </button>
                {auth.user ? (
                  <button
                    type="button"
                    className="wm-logout"
                    disabled={busy}
                    onClick={() => void logout()}
                  >
                    <LogOut size={21} />
                    {busy ? "Logging out…" : "Log Out"}
                  </button>
                ) : null}
              </nav>

              {wallet.address && auth.user ? (
                <Link to="/rewards" className="wm-primary" onClick={() => setOpen(false)}>
                  <Wallet size={18} />
                  Get Virtual USDC
                </Link>
              ) : (
                <button
                  type="button"
                  className="wm-primary"
                  disabled={access.busy || access.restoring}
                  onClick={() => {
                    if (access.state === "connect") setOpen(false);
                    void access.run();
                  }}
                >
                  {access.label || "Verify wallet"}
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
