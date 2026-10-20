const fs = require("fs"),
  path = require("path"),
  zlib = require("zlib");
const esbuild = require("esbuild");
const root = process.cwd();
const mime = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
};
function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const modules = walk(root + "/.output/server")
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => ({
    name: path.relative(root + "/.output/server", f),
    content: esbuild.transformSync(fs.readFileSync(f, "utf8"), {
      minify: true,
      legalComments: "none",
      target: "es2022",
      format: "esm",
      charset: "utf8",
    }).code,
  }));
const assets = {};
for (const file of walk(root + "/.output/public")) {
  if (
    ["_headers", "_redirects", "tacpredict-intro.mp4", "tacpredict-intro.mp4.b64"].includes(
      path.basename(file),
    )
  )
    continue;
  const url = "/" + path.relative(root + "/.output/public", file);
  assets[url] = {
    data: zlib.gzipSync(fs.readFileSync(file)).toString("base64"),
    type: mime[path.extname(file)] || "application/octet-stream",
    cache: url.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600",
  };
}
modules.push({
  name: "static-assets.mjs",
  content: "export default " + JSON.stringify(assets) + ";",
});
const names = {
  registry: "MarketRegistry",
  factory: "MarketFactory",
  positions: "ConditionalPositions",
  exchange: "Exchange",
  oracle: "ResolutionOracle",
  settlement: "Settlement",
};
const arts = Object.fromEntries(
  Object.entries(names).map(([k, n]) => [
    k,
    {
      abi: JSON.parse(fs.readFileSync(path.join(root, "protocol/artifacts", n + ".json"), "utf8"))
        .abi,
    },
  ]),
);
const indexer = esbuild.buildSync({
  entryPoints: [path.join(root, "protocol/scripts/indexer-core.mjs")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  external: ["node:crypto"],
  conditions: ["browser", "import", "default"],
  minify: true,
}).outputFiles[0].text;
modules.push({ name: "protocol-indexer.mjs", content: indexer });
modules.push({
  name: "protocol-indexer-artifacts.mjs",
  content: "export default " + JSON.stringify(arts) + ";",
});
const discovery = esbuild.buildSync({
  entryPoints: [path.join(root, "src/lib/agent/import-core.mjs")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
}).outputFiles[0].text;
modules.push({ name: "market-discovery.mjs", content: discovery });
// Price reporter for the Up/Down pool: one viem bundle, run from the once-a-minute scheduled job.
const keeper = esbuild.buildSync({
  entryPoints: [path.join(root, "src/lib/pool/keeper-chain.mjs")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  conditions: ["browser", "import", "default"],
  minify: true,
}).outputFiles[0].text;
modules.push({ name: "pool-keeper.mjs", content: keeper });
// A committed pool address in deployment.ts is the default when no UPDOWN_POOL_ADDRESS variable is set.
const poolAddress =
  (fs.readFileSync(path.join(root, "src/lib/pool/deployment.ts"), "utf8").match(/address:\s*"(0x[0-9a-fA-F]{40})"/) || [])[1] || "";
const entry = `import {runPoolKeeper} from './pool-keeper.mjs';import {runMarketDiscovery} from './market-discovery.mjs';import {runFinalizedIndexer,safeError} from './protocol-indexer.mjs';import protocolArts from './protocol-indexer-artifacts.mjs';import app from './index.mjs';import assets from './static-assets.mjs';
function staticResponse(input,init){const req=input instanceof Request?input:new Request(input,init);const asset=assets[new URL(req.url).pathname];if(!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));return new Response(req.method==='HEAD'?null:bytes,{encodeBody:'manual',headers:{'Content-Type':asset.type,'Content-Encoding':'gzip','Cache-Control':asset.cache,'X-Content-Type-Options':'nosniff'}});}
export default {async scheduled(controller,env,ctx){if(controller.cron === '*/15 * * * *'){ctx.waitUntil(runMarketDiscovery(env).then(r=>console.log(JSON.stringify({job:"market-discovery",...r}))).catch(()=>console.error("Market discovery failed; no financial action submitted")));return;}ctx.waitUntil(runPoolKeeper({POOL_REPORTER_PRIVATE_KEY:env.POOL_REPORTER_PRIVATE_KEY,UPDOWN_POOL_ADDRESS:env.UPDOWN_POOL_ADDRESS||${JSON.stringify(poolAddress)},BASE_PROTOCOL_RPC_URL:env.BASE_PROTOCOL_RPC_URL,COINGECKO_DEMO_API_KEY:env.COINGECKO_DEMO_API_KEY},{maxAttempts:1,waitForReceipts:false}).then(r=>{if(r.status!=='NOTHING_DUE'&&r.status!=='TOO_LATE'&&r.status!=='NO_ROUNDS'&&r.status!=='NOT_CONFIGURED')console.log(JSON.stringify({job:"pool-keeper",status:r.status,boundary:r.boundary,ends:r.ends,starts:r.starts,hashes:r.hashes}))}).catch(e=>console.error("Pool keeper failed: "+String((e&&(e.shortMessage||e.message))||"error").replace(/https?:\\/\\/\\S+/g,"[url]").slice(0,160))));const config={SUPABASE_URL:env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY,PROTOCOL_RPC_URL:env.BASE_PROTOCOL_RPC_URL,PROTOCOL_CHAIN_ID:'8453',INDEXER_REQUEST_LIMIT:env.POOL_REPORTER_PRIVATE_KEY?'34':'48'};ctx.waitUntil(runFinalizedIndexer(config,protocolArts,6).then(result=>console.log(JSON.stringify({job:"indexer",status:result?"SUCCESS":"SKIPPED",...result}))).catch(e=>console.error(safeError(e,config))));},async fetch(req,env,ctx){if(new URL(req.url).pathname === '/api/agent/scheduled') {
if(req.method !== 'POST')return new Response('Method not allowed',{status:405});
const incoming=req.headers.get('Authorization') || '';
const expected=env.MARKET_DISCOVERY_SCHEDULER_SECRET ? 'Bearer '+env.MARKET_DISCOVERY_SCHEDULER_SECRET : '';
if(!expected || incoming.length !== expected.length)return new Response('Unauthorized',{status:401});
const a=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(incoming)));
const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expected)));
let diff=0;for(let i=0;i<a.length;i++)diff |= a[i]^b[i];if(diff)return new Response('Unauthorized',{status:401});
try{const result=await runMarketDiscovery(env);console.log(JSON.stringify({job:'market-discovery',trigger:'supabase-cron',...result}));return Response.json(result);}catch{return new Response('Discovery failed',{status:503});}}
if(new URL(req.url).pathname === '/api/agent/discover'){
if(req.method!=='POST')return new Response('Method not allowed',{status:405});
const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return new Response('Unauthorized',{status:401});
const permission=await fetch(env.SUPABASE_URL+'/rest/v1/rpc/get_market_import_admin',{method:'POST',headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,Authorization:auth,'Content-Type':'application/json'},body:'{}'});
if(!permission.ok){await permission.body?.cancel();return new Response('Assigned administrator with MFA required',{status:403});}await permission.body?.cancel();
try{return Response.json(await runMarketDiscovery(env));}catch{return new Response('Discovery failed',{status:503});}}
if(assets[new URL(req.url).pathname])return staticResponse(req);return app.fetch(req,{...env,ASSETS:{fetch:(input,init)=>Promise.resolve(staticResponse(input,init))}},ctx);}};`;
modules.push({ name: "entry.mjs", content: entry });
const packed = zlib.gzipSync(Buffer.from(JSON.stringify(modules)), { level: 9 }).toString("base64");
fs.writeFileSync(root + "/.output/worker-packed.b64", packed);
fs.writeFileSync(root + "/.output/worker-modules.json", JSON.stringify(modules));
console.log(
  "Modules",
  modules.length,
  "packed bytes",
  packed.length,
  "gzip deployment size",
  zlib.gzipSync(Buffer.from(modules.map((m) => m.content).join("\n")), { level: 9 }).length,
);
