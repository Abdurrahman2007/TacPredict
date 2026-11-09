export function hasSiweAttempt(address: string | null | undefined): boolean;
export function markSiweAttempt(address: string | null | undefined): void;
export function clearSiweAttempt(address: string | null | undefined): void;
export function subscribeSiweAttempts(cb: () => void): () => void;
