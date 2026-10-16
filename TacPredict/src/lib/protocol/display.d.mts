type OutcomeLike = { probability: number; probabilityKnown?: boolean | undefined } | null | undefined;
export function usdcShort(atomic: string | bigint | number | null | undefined): string;
export function dollarsShort(value: number | null | undefined): string;
export function pct(outcome: OutcomeLike): string;
export function cents(outcome: OutcomeLike): string;
export function volumeText(volume: string | null | undefined): string;
export function sharesShort(atomic: string | bigint | number | null | undefined): string;
