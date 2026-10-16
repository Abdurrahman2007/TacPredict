/** Market image rules shared by the admin upload server function, the form and tests. */
export const MARKET_IMAGE_BUCKET = "market-images";
export const MARKET_IMAGE_MAX_BYTES = 1_500_000;
export const MARKET_IMAGE_MAX_BASE64 = Math.ceil((MARKET_IMAGE_MAX_BYTES * 4) / 3) + 8;
export const MARKET_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

const FILE_NAME = /^[0-9a-f]{64}\.(png|jpg|webp)$/;
const PUBLIC_PATH = `/storage/v1/object/public/${MARKET_IMAGE_BUCKET}/`;

/** Identify a raster image from its first bytes. SVG and everything else is refused. */
export function detectImage(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return { mime: "image/png", ext: "png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: "image/jpeg", ext: "jpg" };
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Strict base64 (no data: prefix) to bytes, or null when malformed. */
export function decodeBase64(text) {
  if (typeof text !== "string" || !text || text.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Content-addressed object name: the same picture always maps to the same file. */
export function marketImageFileName(hashHex, ext) {
  const name = `${String(hashHex).toLowerCase()}.${ext}`;
  if (!FILE_NAME.test(name)) throw Error("Invalid image name");
  return name;
}

export function hexOf(buffer) {
  return Array.from(new Uint8Array(buffer), (v) => v.toString(16).padStart(2, "0")).join("");
}

/** Shape check that does not need the environment: https + our public bucket path + hashed name. */
export function isManagedImageUrl(url) {
  if (typeof url !== "string" || url.length > 500) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.search || parsed.hash || parsed.username) return false;
  if (!parsed.pathname.startsWith(PUBLIC_PATH)) return false;
  return FILE_NAME.test(parsed.pathname.slice(PUBLIC_PATH.length));
}

/** Server-side check: also pins the host to the project's own Supabase origin. */
export function isImageFromProject(url, supabaseUrl) {
  if (!isManagedImageUrl(url)) return false;
  try {
    return new URL(url).origin === new URL(supabaseUrl).origin;
  } catch {
    return false;
  }
}
