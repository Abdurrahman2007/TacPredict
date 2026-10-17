export type FiveMinuteTimes = {
  openAt: string;
  closeAt: string;
  resolveAfter: string;
  resolutionDeadline: string;
};
export function fiveMinuteTemplate(
  asset: "bitcoin" | "ethereum",
  now?: number,
): {
  title: string;
  description: string;
  category: "Crypto";
  outcomes: string;
  rules: string;
  source: string;
  sourceUrl: string;
  times: FiveMinuteTimes;
};
