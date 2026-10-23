import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accountApi } from "@/lib/accounts/client";
import { Badge, Card, Notice, PageHeader } from "../admin-ui";
type Row = {
  user_id: string;
  username: string;
  referral_code: string;
  status: string;
  referred_by: string | null;
  inviter_name: string | null;
  invited: number;
  earned: number;
  created_at: string;
};
type List = {
  rows: Row[];
  total: number;
  page: number;
  policy: { enabled: number; reward_units: number; review_required: number };
};
type Detail = {
  profile: Row;
  rewards: {
    invitee_id: string;
    username: string;
    amount_units: number;
    status: string;
    created_at: string;
  }[];
  audit: { id: string; action: string; reason: string; created_at: string }[];
};
export function ReferralsView() {
  const [page, setPage] = useState(0),
    [input, setInput] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-referrals", page, search],
    queryFn: () => accountApi<List>(`/admin?page=${page}&search=${encodeURIComponent(search)}`),
    retry: 0,
  });
  const detail = useQuery({
    queryKey: ["admin-referral-detail", selected],
    enabled: Boolean(selected),
    queryFn: () => accountApi<Detail>(`/admin/detail?id=${encodeURIComponent(selected!)}`),
    retry: 0,
  });
  async function run(path: string, data: unknown) {
    setBusy(true);
    setNotice("");
    try {
      await accountApi(path, data);
      setNotice("Saved · audit recorded");
      await client.invalidateQueries({ queryKey: ["admin-referrals"] });
      await client.invalidateQueries({ queryKey: ["admin-referral-detail"] });
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function edit(row: Row, action: string, value: string) {
    const reason = window.prompt("Reason for this change (required)");
    if (!reason?.trim()) return;
    if (!window.confirm(`Confirm ${action} change for @${row.username}? No real USDC will move.`))
      return;
    await run("/admin/update", { userId: row.user_id, action, value, reason });
  }
  return (
    <div className="adm-stack">
      <PageHeader title="Referrals" subtitle="Profiles · permanent attribution · virtual rewards" />
      <div className="adm-tabs">
        <button className="adm-tab" onClick={() => setSelected(null)}>
          All accounts
        </button>
      </div>
      {notice && (
        <p role="status" className="adm-callout">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Loading referrals…</p>
      ) : query.isError ? (
        <Notice tone="bad">
          {query.error.message}
          <button className="adm-btn" onClick={() => void query.refetch()}>
            Retry
          </button>
        </Notice>
      ) : (
        query.data && (
          <>
            <Card title="Reward policy">
              <PolicyEditor
                key={JSON.stringify(query.data.policy)}
                policy={query.data.policy}
                busy={busy}
                save={(v) => void run("/admin/policy", v)}
              />
              <p className="adm-muted">
                Changes apply to new signups only. Previous reward amounts and bindings remain
                unchanged.
              </p>
            </Card>
            <Card title={`Accounts · ${query.data.total}`}>
              <form
                className="adm-filterbar"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(0);
                  setSearch(input);
                }}
              >
                <input
                  className="adm-input"
                  placeholder="Username, user ID or referral code"
                  aria-label="Search referrals"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button className="adm-btn">Search</button>
              </form>
              <div className="adm-referral-rows">
                {query.data.rows.map((r) => (
                  <article key={r.user_id}>
                    <div>
                      <b>@{r.username}</b>
                      <small>{r.referral_code}</small>
                      <span>
                        {r.invited} invited · {r.earned} USDC virtual credits
                      </span>
                      {r.inviter_name && <span>Referred by @{r.inviter_name}</span>}
                    </div>
                    <div>
                      <Badge tone={r.status === "active" ? "ok" : "bad"}>{r.status}</Badge>
                      <button className="adm-btn" onClick={() => setSelected(r.user_id)}>
                        Manage
                      </button>
                    </div>
                  </article>
                ))}
                {!query.data.rows.length && <p className="adm-muted">No accounts found.</p>}
              </div>
              <div className="adm-filterbar">
                <button className="adm-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>Page {page + 1}</span>
                <button
                  className="adm-btn"
                  disabled={(page + 1) * 25 >= query.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </Card>
          </>
        )
      )}
      {selected && (
        <Card title="Account details">
          {detail.isPending ? (
            <p>Loading account…</p>
          ) : detail.isError ? (
            <Notice tone="bad">{detail.error.message}</Notice>
          ) : (
            detail.data && (
              <>
                <h3>@{detail.data.profile.username}</h3>
                <p className="adm-muted break-all">{detail.data.profile.user_id}</p>
                <p>Code · {detail.data.profile.referral_code}</p>
                <div className="adm-filterbar">
                  <button
                    className="adm-btn"
                    disabled={busy}
                    onClick={() => {
                      const v = window.prompt("New username", detail.data!.profile.username);
                      if (v) void edit(detail.data!.profile, "username", v);
                    }}
                  >
                    Edit username
                  </button>
                  <button
                    className="adm-btn"
                    disabled={busy}
                    onClick={() => {
                      const v = window.prompt(
                        "New code · 16 hexadecimal characters",
                        detail.data!.profile.referral_code,
                      );
                      if (v) void edit(detail.data!.profile, "code", v);
                    }}
                  >
                    Change code
                  </button>
                  <button
                    className="adm-btn"
                    disabled={busy}
                    onClick={() =>
                      void edit(
                        detail.data!.profile,
                        "status",
                        detail.data!.profile.status === "active" ? "suspended" : "active",
                      )
                    }
                  >
                    {detail.data.profile.status === "active"
                      ? "Suspend referrals"
                      : "Restore referrals"}
                  </button>
                </div>
                <p className="adm-muted">
                  Existing codes remain valid after rotation. Referrer binding cannot be reassigned.
                </p>
                <h3 className="mt-5">Invited friends</h3>
                <div className="adm-referral-rows">
                  {detail.data.rewards.map((r) => (
                    <article key={r.invitee_id}>
                      <div>
                        <b>@{r.username}</b>
                        <span>
                          {r.amount_units} USDC virtual · {r.status}
                        </span>
                      </div>
                      <select
                        className="adm-select"
                        aria-label={`Reward status for ${r.username}`}
                        value={r.status}
                        disabled={busy}
                        onChange={(e) =>
                          void edit(
                            {
                              ...detail.data!.profile,
                              user_id: r.invitee_id,
                              username: r.username,
                            },
                            "reward",
                            e.target.value,
                          )
                        }
                      >
                        {["credited", "pending", "revoked"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
                <h3 className="mt-5">Recent audit</h3>
                {detail.data.audit.length ? (
                  detail.data.audit.map((a) => (
                    <p key={a.id} className="adm-muted">
                      {a.action} · {a.reason} · {new Date(a.created_at).toLocaleString()}
                    </p>
                  ))
                ) : (
                  <p className="adm-muted">No changes yet.</p>
                )}
              </>
            )
          )}
        </Card>
      )}
    </div>
  );
}
function PolicyEditor({
  policy,
  busy,
  save,
}: {
  policy: List["policy"];
  busy: boolean;
  save: (v: unknown) => void;
}) {
  const [enabled, setEnabled] = useState(Boolean(policy.enabled)),
    [review, setReview] = useState(Boolean(policy.review_required)),
    [reward, setReward] = useState(policy.reward_units),
    [reason, setReason] = useState("");
  return (
    <form
      className="adm-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("Update referral policy for future signups?"))
          save({ enabled, reviewRequired: review, rewardUnits: reward, reason });
      }}
    >
      <div className="adm-filterbar">
        <label className="adm-label">
          Reward · virtual USDC
          <input
            className="adm-input"
            type="number"
            min={0}
            max={1000}
            step={1}
            value={reward}
            onChange={(e) => setReward(Number(e.target.value))}
          />
        </label>
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{" "}
          Referrals enabled
        </label>
        <label>
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />{" "}
          Review every reward
        </label>
      </div>
      <input
        className="adm-input"
        aria-label="Policy change reason"
        placeholder="Reason for change"
        maxLength={300}
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button className="adm-btn adm-btn-primary" disabled={busy || !reason.trim()}>
        Save policy
      </button>
    </form>
  );
}
