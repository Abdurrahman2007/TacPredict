import { MARKET_IMAGE_MAX_BYTES } from "./market-image.mjs";

const MAX_SIDE = 800;

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.onload = () => {
      const text = String(reader.result);
      resolve(text.slice(text.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Shrinks a phone photo/screenshot to at most 800px and re-encodes it as WebP (JPEG fallback), so
 * the upload stays small. Returns the base64 body the admin upload function expects.
 */
export async function prepareMarketImage(file: File): Promise<string> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type))
    throw new Error("Choose a PNG, JPEG or WebP picture.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot resize pictures.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [
      ["image/webp", 0.86],
      ["image/webp", 0.7],
      ["image/jpeg", 0.8],
    ] as const) {
      const blob = await toBlob(canvas, type, quality);
      if (blob && blob.type === type && blob.size <= MARKET_IMAGE_MAX_BYTES) return toBase64(blob);
    }
    throw new Error("Picture is still too large after resizing. Try a smaller one.");
  } finally {
    bitmap.close();
  }
}
