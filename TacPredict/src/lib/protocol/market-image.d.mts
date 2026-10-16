export const MARKET_IMAGE_BUCKET: "market-images";
export const MARKET_IMAGE_MAX_BYTES: number;
export const MARKET_IMAGE_MAX_BASE64: number;
export const MARKET_IMAGE_TYPES: readonly string[];
export function detectImage(
  bytes: Uint8Array | null | undefined,
): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" } | null;
export function decodeBase64(text: unknown): Uint8Array | null;
export function marketImageFileName(hashHex: string, ext: string): string;
export function hexOf(buffer: ArrayBuffer): string;
export function isManagedImageUrl(url: unknown): boolean;
export function isImageFromProject(url: unknown, supabaseUrl: string): boolean;
