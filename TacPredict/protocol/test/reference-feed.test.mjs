import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReferenceCandles } from '../../src/lib/updown/reference-candles.mjs';
const good={start:'60',open:'10',high:'13',low:'9',close:'12'};
test('reference OHLC preserves actual values in chronological order',()=>{
 const rows=parseReferenceCandles({candles:[{...good,start:'120'},good]},180000);
 assert.deepEqual(rows.map(x=>x.time),[60000,120000]);
 assert.deepEqual(rows[0],{time:60000,open:10,high:13,low:9,close:12});
});
test('reference OHLC rejects malformed, impossible and future observations without filling gaps',()=>{
 const rows=parseReferenceCandles({candles:[good,{...good,start:'240'}, {...good,start:'120',high:'8'}, {...good,start:'180',low:'14'}, {...good,start:'100',close:'NaN'}, {...good,start:'90',open:null},null]},200000);
 assert.equal(rows.length,1);
 assert.throws(()=>parseReferenceCandles({},200000));
});
test('public chart source stays server-side and independent from settlement evidence',()=>{
 const src=p=>readFileSync(new URL('../../src/'+p,import.meta.url),'utf8');
 assert.ok(src('lib/updown/use-price-window.ts').includes('referenceWindowQueryOptions(asset, lookback)'));
 assert.ok(src('lib/updown/reference.server.ts').includes('api.coinbase.com/api/v3/brokerage/market/products'));
 assert.ok(src('lib/updown/reference.server.ts').includes('cache.put'));
 assert.ok(src('lib/updown/spot.server.ts').includes('https://api.exchange.coinbase.com'));
 assert.match(src('routes/profile.tsx'), /useSyncExternalStore\(\s*subscribeHydration,\s*\(\) => true,\s*\(\) => false,/);
});
