import { sortListings } from './listing-sort.mjs';
export function homeFeedListings(markets, feed, now = Date.now()) {
  if (feed === 'Live') return markets.filter(m => {
    const open = Date.parse(m.startsAt ?? m.native?.openAt ?? '');
    const close = Date.parse(m.endsAt ?? m.native?.closeAt ?? '');
    return m.native?.status === 'OPEN' && Number.isFinite(open) && Number.isFinite(close) && open <= now && close > now;
  });
  if (feed === 'Upcoming') return markets.filter(m => {
    const open = Date.parse(m.startsAt ?? m.native?.openAt ?? '');
    return ['UPCOMING', 'OPEN'].includes(m.native?.status) && Number.isFinite(open) && open > now;
  }).sort((a,b) => Date.parse(a.startsAt ?? a.native.openAt) - Date.parse(b.startsAt ?? b.native.openAt));
  return sortListings(markets, feed === 'New' ? 'New' : 'Trending');
}
