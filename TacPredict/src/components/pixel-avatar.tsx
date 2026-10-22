/** Deterministic, local pixel-animal icons. No remote requests or wallet metadata uploads. */
const palettes = [
  ["#233e4a", "#75d0c0", "#d7fff0"],
  ["#44334e", "#c5a0ee", "#f1dcff"],
  ["#4d372d", "#f2aa66", "#ffe8bf"],
  ["#2b4057", "#82b7f8", "#dceaff"],
  ["#3d422d", "#bccd75", "#f3f9cf"],
];
const animals = [
  [
    "..###...###..",
    "..####.####..",
    "...#######...",
    "..#########..",
    ".###########.",
    ".##..###..##.",
    ".##..###..##.",
    ".###########.",
    "..####.####..",
    "...##...##...",
  ],
  [
    "...##...##...",
    "..###...###..",
    ".###########.",
    "#############",
    "###..###..###",
    "###..###..###",
    ".###########.",
    "..###...###..",
    "...#######...",
    "....#####....",
  ],
  [
    "..###...###..",
    ".#####.#####.",
    "#############",
    "#############",
    "###..###..###",
    "###..###..###",
    "#############",
    ".####...####.",
    "..#########..",
    "...#######...",
  ],
  [
    "..###...###..",
    ".#####.#####.",
    ".##.#####.##.",
    "#############",
    "#############",
    "###..###..###",
    "###..###..###",
    "#############",
    "..###...###..",
    "...#######...",
  ],
];
export function PixelAvatar({ seed, size = 44 }: { seed: string; size?: number }) {
  let hash = 2166136261;
  for (const c of seed.toLowerCase()) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  const [bg, fur, light] = palettes[hash % palettes.length]!,
    animal = animals[(hash >>> 4) % animals.length]!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      role="img"
      aria-label="Generated pixel animal avatar"
      style={{ borderRadius: "50%", flexShrink: 0 }}
      shapeRendering="crispEdges"
    >
      <rect width="20" height="20" fill={bg} />
      {animal.flatMap((row, y) =>
        [...row].map((v, x) =>
          v === "#" ? (
            <rect
              key={`${x}-${y}`}
              x={x + 3}
              y={y + 5}
              width="1"
              height="1"
              fill={y > 6 ? light : fur}
            />
          ) : null,
        ),
      )}
      <path d="M6 10h1v2H6zm7 0h1v2h-1z" fill="#10222b" />
      <path d="M9 13h2v1H9z" fill="#10222b" />
      <path d="M5 9h1v1H5zm7 0h1v1h-1z" fill="#fff" />
    </svg>
  );
}
