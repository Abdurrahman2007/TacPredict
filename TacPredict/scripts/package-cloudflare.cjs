const fs=require('fs'),path=require('path'),zlib=require('zlib');const esbuild=require('esbuild');
const root=process.cwd();
const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8'};
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const modules=walk(root+'/.output/server').filter(f=>f.endsWith('.mjs')).map(f=>({name:path.relative(root+'/.output/server',f),content:esbuild.transformSync(fs.readFileSync(f,'utf8'),{minify:true,legalComments:'none',target:'es2022',format:'esm',charset:'utf8'}).code}));
const assets={};for(const file of walk(root+'/.output/public')){if(['_headers','_redirects'].includes(path.basename(file)))continue;const url='/'+path.relative(root+'/.output/public',file);assets[url]={data:zlib.gzipSync(fs.readFileSync(file)).toString('base64'),type:mime[path.extname(file)]||'application/octet-stream',cache:url.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=3600'};}
modules.push({name:'static-assets.mjs',content:'export default '+JSON.stringify(assets)+';'});
const entry=`import app from './index.mjs';import assets from './static-assets.mjs';
function staticResponse(input,init){const req=input instanceof Request?input:new Request(input,init);const asset=assets[new URL(req.url).pathname];if(!asset)return new Response('Not found',{status:404});if(!['GET','HEAD'].includes(req.method))return new Response('Method not allowed',{status:405});const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));return new Response(req.method==='HEAD'?null:bytes,{encodeBody:'manual',headers:{'Content-Type':asset.type,'Content-Encoding':'gzip','Cache-Control':asset.cache,'X-Content-Type-Options':'nosniff'}});}
export default {async fetch(req,env,ctx){if(assets[new URL(req.url).pathname])return staticResponse(req);return app.fetch(req,{...env,ASSETS:{fetch:(input,init)=>Promise.resolve(staticResponse(input,init))}},ctx);}};`;
modules.push({name:'entry.mjs',content:entry});
const packed=zlib.gzipSync(Buffer.from(JSON.stringify(modules)),{level:9}).toString('base64');
fs.writeFileSync(root+'/.output/worker-packed.b64',packed);fs.writeFileSync(root+'/.output/worker-modules.json',JSON.stringify(modules));
console.log('Modules',modules.length,'packed bytes',packed.length,'gzip deployment size',zlib.gzipSync(Buffer.from(modules.map(m=>m.content).join('\n')),{level:9}).length);
