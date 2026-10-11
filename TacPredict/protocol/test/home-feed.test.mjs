import test from 'node:test';import assert from 'node:assert/strict';
import { homeFeedListings } from '../../src/lib/markets/home-feed.mjs';
const now=Date.parse('2026-10-11T12:00:00Z');
const mk=(id,start,end,status,created,volume)=>({id,startsAt:start,endsAt:end,createdAt:created,native:{status,volume24hAtomic:volume}});
const rows=[mk('live','2026-10-11T10:00Z','2026-10-12T10:00Z','OPEN','2026-10-10','100'),mk('future','2026-10-12T10:00Z','2026-10-13T10:00Z','UPCOMING','2026-10-11','0'),mk('old','2026-10-09T10:00Z','2026-10-10T10:00Z','CLOSED','2026-10-09','10')];
test('Live excludes upcoming/closed; Upcoming requires future opening',()=>{assert.deepEqual(homeFeedListings(rows,'Live',now).map(m=>m.id),['live']);assert.deepEqual(homeFeedListings(rows,'Upcoming',now).map(m=>m.id),['future'])});
test('New creation date and Trending real volume; no mutation',()=>{assert.equal(homeFeedListings(rows,'New',now)[0].id,'future');assert.equal(homeFeedListings(rows,'Trending',now)[0].id,'live');assert.equal(rows[0].id,'live')});
