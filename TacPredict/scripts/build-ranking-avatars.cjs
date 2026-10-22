const fs = require("node:fs");
const path = require("node:path");
const assets = require("./ranking-avatars.json");
const out = path.join(__dirname, "../public/avatars");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "pixel-animals-v1.webp"), Buffer.from(assets.webp, "base64"));
console.log("Built local pixel-animal avatars.");
