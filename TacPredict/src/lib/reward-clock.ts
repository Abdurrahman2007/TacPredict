export function secondsUntil(availableAt: string | null, now: number) {
  if (!availableAt) return 0;
  const target = Date.parse(availableAt);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}
export function cooldownLabel(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}
