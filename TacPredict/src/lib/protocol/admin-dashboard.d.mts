export function countFromDetail(detail: string | undefined | null): string | null;
export function adminMoney(value: string | null | undefined): string;
export function marketType(category: string, subcategory: string | null): string;
export function aggregateExecutions(
  rows: { usdc_atomic: string | number; buyer: string; seller: string }[],
): { volumeAtomic: string; participants: number };
