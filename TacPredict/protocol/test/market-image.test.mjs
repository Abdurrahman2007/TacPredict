import test from "node:test";
import assert from "node:assert/strict";
import {
  detectImage,
  decodeBase64,
  marketImageFileName,
  isManagedImageUrl,
  isImageFromProject,
  hexOf,
} from "../../src/lib/protocol/market-image.mjs";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const hash = "a".repeat(64);

test("only PNG, JPEG and WebP are recognised, by content not by name", () => {
  assert.deepEqual(detectImage(png), { mime: "image/png", ext: "png" });
  assert.deepEqual(detectImage(jpg), { mime: "image/jpeg", ext: "jpg" });
  assert.deepEqual(detectImage(webp), { mime: "image/webp", ext: "webp" });
  assert.equal(detectImage(svg), null);
  assert.equal(detectImage(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
  assert.equal(detectImage(Uint8Array.from([1, 2, 3])), null);
  assert.equal(detectImage(null), null);
});
test("base64 decoding is strict", () => {
  assert.deepEqual(Array.from(decodeBase64("AQID")), [1, 2, 3]);
  assert.equal(decodeBase64("data:image/png;base64,AQID"), null);
  assert.equal(decodeBase64("AQI"), null);
  assert.equal(decodeBase64(""), null);
  assert.equal(decodeBase64(5), null);
});
test("object names are content hashes", () => {
  assert.equal(marketImageFileName(hash, "webp"), `${hash}.webp`);
  assert.throws(() => marketImageFileName("../x", "png"));
  assert.throws(() => marketImageFileName(hash, "svg"));
  assert.equal(hexOf(Uint8Array.from([0, 255, 16]).buffer), "00ff10");
});
test("only the project's own public bucket path is accepted as a market image", () => {
  const ok = `https://abc.supabase.co/storage/v1/object/public/market-images/${hash}.webp`;
  assert.equal(isManagedImageUrl(ok), true);
  assert.equal(isImageFromProject(ok, "https://abc.supabase.co"), true);
  assert.equal(isImageFromProject(ok, "https://other.supabase.co"), false);
  assert.equal(isManagedImageUrl(ok.replace("https:", "http:")), false);
  assert.equal(isManagedImageUrl(`https://evil.example/${hash}.webp`), false);
  assert.equal(isManagedImageUrl(ok + "?x=1"), false);
  assert.equal(isManagedImageUrl(ok.replace("market-images", "avatars")), false);
  assert.equal(isManagedImageUrl("https://abc.supabase.co/storage/v1/object/public/market-images/../x.png"), false);
  assert.equal(isManagedImageUrl(42), false);
});
