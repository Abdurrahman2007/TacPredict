/** Clean initial avatar: a coloured circle with one letter, no generated artwork. */
const GRADIENTS = [
  "linear-gradient(135deg, #0a84ff, #5e5ce6)",
  "linear-gradient(135deg, #30d158, #64d2ff)",
  "linear-gradient(135deg, #bf5af2, #ff375f)",
  "linear-gradient(135deg, #ff9f0a, #ff375f)",
  "linear-gradient(135deg, #64d2ff, #0a84ff)",
  "linear-gradient(135deg, #30d158, #0a84ff)",
];

export function InitialAvatar({
  seed,
  size = 40,
  label,
}: {
  seed: string;
  size?: number;
  label?: string | undefined;
}) {
  let hash = 2166136261;
  for (const c of seed.toLowerCase()) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const clean = (label ?? "").replace(/^@/, "").trim();
  const initial = clean ? clean[0]!.toUpperCase() : "T";
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: GRADIENTS[hash % GRADIENTS.length],
        color: "#fff",
        fontSize: Math.round(size * 0.42),
        fontWeight: 750,
        lineHeight: 1,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)",
      }}
    >
      {initial}
    </span>
  );
}
