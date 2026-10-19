export const COPY_BUCKET: string;
export const COPY_FILE: string;
export const ASSET_NAMES: Record<string, string>;
export function defaultCopy(asset: string): { title: string; description: string };
export function cleanCopy(input: { title?: unknown; description?: unknown }): { title: string; description: string } | { error: string };
export function copyFor(
  saved: Record<string, { title?: string; description?: string }> | null | undefined,
  asset: string,
): { title: string; description: string; custom: boolean };
