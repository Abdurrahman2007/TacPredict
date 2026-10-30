import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Check,
  Copy,
  Gift,
  Users,
  Link2,
  ShieldCheck,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { OwnProfile } from "./own-profile";
import { useAccount } from "./account-provider";
import { useBaseWallet } from "@/lib/onchain/use-base-wallet";
import { useWalletAccess } from "@/hooks/use-wallet-access";
import { PixelAvatar } from "./pixel-avatar";
import { accountApi } from "@/lib/accounts/client";
import { normalizeUsername } from "@/lib/accounts/rules.mjs";
export function AccountGate({ children }: { children: React.ReactNode }) {
  const path = useLocation().pathname;
  const { auth, query } = useAccount();
  const access = useWalletAccess(path === "/referrals" ? "/referrals" : "/account");
  if (!auth.ready || (auth.user && query.isPending))
    return (
      <section className="account-card account-center" role="status">
        Setting up your account…
      </section>
    );
  if (!auth.user)
    return (
      <section className="account-card account-center">
        <div className="account-feature-icon">
          <UserRound size={26} />
        </div>
        <h2>Your TacPredict account</h2>
        <p>Connect your wallet and sign a free message to create your profile and referral link.</p>
        <button
          className="account-primary"
          disabled={access.busy}
          onClick={() => void access.run()}
        >
          {access.label || "Sign in with wallet"}
          <ArrowUpRight size={17} />
        </button>
        <small>No transaction or token approval.</small>
        {access.error && (
          <p role="alert" className="account-error">
            {access.error}
          </p>
        )}
      </section>
    );
  if (query.isError)
    return (
      <section className="account-card account-center" role="alert">
        <h2>Account could not load</h2>
        <p>{query.error.message}</p>
        <button className="account-secondary" onClick={() => void query.refetch()}>
          <RefreshCw size={16} />
          Retry
        </button>
      </section>
    );
  return <>{children}</>;
}
export function AccountPage() {
  return (
    <div className="account-page own-profile-page">
      <h1 className="sr-only">Your Profile</h1>
      <AccountGate>
        <OwnProfile editor={<ProfileEditor />} />
      </AccountGate>
    </div>
  );
}
function ProfileEditor() {
  const { auth, query } = useAccount(),
    cache = useQueryClient(),
    wallet = useBaseWallet();
  const profile = query.data?.profile;
  const [name, setName] = useState(""),
    [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const currentUsername = profile?.username;
  useEffect(() => {
    if (currentUsername) setName(currentUsername);
  }, [currentUsername]);
  useEffect(() => {
    let active = true;
    setCheck(null);
    if (!profile || name === profile.username) return;
    let normalized;
    try {
      normalized = normalizeUsername(name);
    } catch (e) {
      setCheck({ ok: false, text: (e as Error).message });
      return;
    }
    const timer = setTimeout(() => {
      void accountApi<{ available: boolean; message: string }>("/username/check", {
        username: normalized,
      })
        .then((r) => {
          if (active) setCheck({ ok: r.available, text: r.message });
        })
        .catch(() => {
          if (active) setCheck({ ok: false, text: "Could not check availability. Try again." });
        });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, profile]);
  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const data = await accountApi("/username", { username: name });
      cache.setQueryData(["account-profile", auth.user!.id], data);
      setMessage("Username updated");
    } catch (e) {
      setCheck({ ok: false, text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }
  if (!profile) return null;
  return (
    <>
      <section className="account-card">
        <div className="account-profile-top">
          <PixelAvatar seed={auth.user!.id} size={76} />
          <div>
            <h2>@{profile.username}</h2>
            <span className="account-badge">
              <ShieldCheck size={12} />
              Wallet account
            </span>
          </div>
        </div>
        <label className="account-label" htmlFor="account-username">
          Username
        </label>
        <div className="account-name-field">
          <span>@</span>
          <input
            id="account-username"
            autoComplete="off"
            maxLength={24}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMessage("");
            }}
            aria-describedby="username-result"
            aria-invalid={check?.ok === false}
          />
        </div>
        <p
          id="username-result"
          className={check ? (check.ok ? "account-success" : "account-error") : "account-helper"}
          aria-live="polite"
        >
          {check?.text ?? "3–24 characters · letters, numbers and underscores"}
        </p>
        <button
          className="account-primary"
          disabled={!check?.ok || saving || profile.status !== "active"}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save username"}
          <Check size={16} />
        </button>
        {message && (
          <p className="account-success" role="status">
            {message}
          </p>
        )}
        <div className="account-meta">
          <span>Wallet</span>
          <b>
            {wallet.address
              ? `${wallet.address.slice(0, 8)}…${wallet.address.slice(-6)}`
              : "Not connected"}
          </b>
        </div>
        <div className="account-meta">
          <span>Referred by</span>
          <b>{profile.referredBy ? "@" + profile.referredBy : "No referrer"}</b>
        </div>
      </section>
    </>
  );
}
export function ReferralsPage() {
  return (
    <div className="account-page">
      <div className="account-page-heading">
        <div>
          <p className="account-eyebrow">GROW TOGETHER</p>
          <h1>Invite friends</h1>
        </div>
        <Gift size={25} />
      </div>
      <AccountGate>
        <ReferralDetails />
      </AccountGate>
    </div>
  );
}
function ReferralDetails() {
  const { query } = useAccount();
  const [copied, setCopied] = useState(false),
    [message, setMessage] = useState("");
  const data = query.data;
  if (!data) return null;
  const url = `https://tacpredict.fun/?ref=${data.profile.referralCode}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Copy unavailable. Select and copy the link below.");
    }
  }
  async function share() {
    try {
      if (navigator.share)
        await navigator.share({ title: "Join TacPredict", text: "Join me on TacPredict", url });
      else await copy();
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setMessage("Sharing unavailable. Copy your link instead.");
    }
  }
  return (
    <>
      <section className="account-card account-referral-hero">
        <span className="account-badge">NON-WITHDRAWABLE REWARD</span>
        <h2>Invite. Trade. Grow.</h2>
        <p>
          Earn <strong>{data.policy.reward_units} USDC</strong> in virtual referral credits when an
          eligible friend creates a new wallet account through your link.
        </p>
        <div className="account-link-box">
          <Link2 size={18} />
          <input aria-label="Your referral link" readOnly value={url} />
          <button aria-label="Copy referral link" onClick={() => void copy()}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
        <div className="account-referral-actions">
          <button
            className="account-primary"
            disabled={!data.policy.enabled || data.profile.status !== "active"}
            onClick={() => void share()}
          >
            Invite a friend
            <ArrowUpRight size={16} />
          </button>
          <span role="status">{copied ? "Link copied" : message}</span>
        </div>
        {!data.policy.enabled && <p className="account-error">New referral rewards are paused.</p>}
        <small>
          Virtual credits only. No cash value or withdrawals. Not part of your real wallet USDC.
        </small>
      </section>
      <div className="account-stats">
        <section>
          <Users size={18} />
          <span>Friends invited</span>
          <strong>{data.stats.invited}</strong>
        </section>
        <section>
          <Gift size={18} />
          <span>Referral credits</span>
          <strong>
            {data.stats.earned.toLocaleString()}
            <small>USDC · virtual</small>
          </strong>
        </section>
      </div>
      {data.stats.pending > 0 && (
        <p className="account-helper">{data.stats.pending} USDC virtual credits pending review.</p>
      )}
      <section className="account-card">
        <h2>Your referrals</h2>
        {data.referrals.length ? (
          <div className="account-referral-list">
            {data.referrals.map((r) => (
              <div key={r.username}>
                <div>
                  <b>@{r.username}</b>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <div>
                  <b>{r.amount_units} USDC</b>
                  <span className={r.status === "credited" ? "account-success" : ""}>
                    {r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="account-center">
            <Users size={30} />
            <h3>Your first invite starts here</h3>
            <p>Share your link. New friends are permanently linked to your account after signup.</p>
          </div>
        )}
      </section>
      <details className="account-rules">
        <summary>How referrals work</summary>
        <p>
          First referral link wins and is remembered on this browser for up to 30 days. Attribution
          is set once, during the first profile setup for a new wallet-authenticated account (within
          24 hours of signup). Existing accounts cannot be rebound. Self-referrals and duplicate
          rewards are blocked. After 10 rewards in one UTC day, additional rewards require review.
          Multiple wallets are not proof of different people; abusive rewards may be revoked.
          Credits are not yet spendable in a trading contract.
        </p>
      </details>
    </>
  );
}
