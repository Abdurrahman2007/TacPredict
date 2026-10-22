/** Local generated artwork with deterministic assignment; no wallet data leaves the app. */
export function PixelAvatar({ seed, size = 56 }: { seed: string; size?: number }) {
  let hash = 2166136261;
  for (const c of seed.toLowerCase()) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const index = hash % 16;
  return (
    <span
      role="img"
      aria-label="Generated pixel animal avatar"
      className="ranking-pixel-avatar"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        backgroundColor: "#21343e",
        backgroundImage: 'url("/avatars/pixel-animals-v1.webp")',
        backgroundSize: "400% 400%",
        backgroundPosition: `${((index % 4) * 100) / 3}% ${(Math.floor(index / 4) * 100) / 3}%`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)",
      }}
    />
  );
}
