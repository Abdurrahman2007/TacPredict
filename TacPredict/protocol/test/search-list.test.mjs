import test from 'node:test';
import assert from 'node:assert/strict';
import { searchListings } from '../../src/lib/markets/search-list.mjs';
const rows = [{id:'1', title:'Will Bitcoin rise?', category:'Crypto', outcomes:[{label:'Yes'}]}, {id:'event-1',title:'Cup final',category:'Sports',outcomes:[{label:'Home team'}]}];
test('aliases and multiple words work across market types',()=>{assert.equal(searchListings(rows,'btc yes').length,1);assert.equal(searchListings(rows,'sports home').length,1);assert.equal(searchListings(rows,'bitcoin sports').length,0)});
test('empty shows all, repeated IDs excluded, originals unchanged',()=>{const original=JSON.stringify(rows);assert.equal(searchListings([...rows,rows[0]],' ').length,2);assert.equal(JSON.stringify(rows),original)});
