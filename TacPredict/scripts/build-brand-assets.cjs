// Materialize logo binary assets from their reviewable base64 source during builds.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { assets } = require("./brand-assets.json");
for (const [target, content] of Object.entries(assets)) {
  if (!/^public\/(?:favicon\.ico|brand\/[a-z0-9-]+\.png)$/.test(target))
    throw new Error("Unexpected brand asset path");
  const file = path.join(root, target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(content, "base64"));
}
// Farcaster Mini App screenshotUrls — use the social OG image until dedicated captures ship.
const social = path.join(root, "public/brand/social-logo-v2.png");
for (const name of ["screenshot-markets.png", "screenshot-portfolio.png", "screenshot-leaderboard.png"]) {
  fs.copyFileSync(social, path.join(root, "public/brand", name));
}
