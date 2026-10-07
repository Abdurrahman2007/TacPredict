const fs=require('node:fs');
fs.writeFileSync('public/brand/tacpredict-intro.mp4',Buffer.from(fs.readFileSync('public/brand/tacpredict-intro.mp4.b64','utf8'),'base64'));
