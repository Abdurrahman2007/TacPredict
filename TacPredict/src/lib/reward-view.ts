/** Pure display state: missing verification is unknown, never locally complete. */
export type RewardSnapshot = {
  account_created: boolean;
  x_connected: boolean;
  deposit_usdc: number;
  predictions: number;
  eligible: boolean;
  locked_credit: number;
  launch_ready?: boolean;
  server_time?: string;
  qualified_at?: string | null;
};
export function rewardView(data: RewardSnapshot | undefined, hasUser: boolean, failed: boolean) {
  const verified = hasUser && !failed && Boolean(data);
  const done = verified
    ? [data!.account_created, data!.deposit_usdc >= 5, data!.predictions >= 4, data!.x_connected]
    : [false, false, false, false];
  const complete = done.filter(Boolean).length;
  const earned = verified && data!.eligible && complete === 4 && data!.locked_credit === 15;
  return {
    verified,
    done,
    complete,
    earned,
    next: !hasUser
      ? "account"
      : !verified
        ? "retry"
        : !done[0]
          ? "account"
          : !done[3]
            ? "x"
            : !done[1]
              ? "deposit"
              : !done[2]
                ? "prediction"
                : "complete",
  };
}
