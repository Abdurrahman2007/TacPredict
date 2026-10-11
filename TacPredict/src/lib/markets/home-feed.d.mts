import type { Market } from '@/domain/markets/types';
export function homeFeedListings(markets: Market[], feed: 'Trending' | 'Live' | 'Upcoming' | 'New', now?: number): Market[];
