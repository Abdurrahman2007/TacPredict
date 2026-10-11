// Search across native listings and explicitly labelled discovery/preview metadata.
export function searchListings(rows, query = '') {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(word =>
    ['btc', 'bitcoin'].includes(word) ? ['btc', 'bitcoin'] :
    ['eth', 'ethereum'].includes(word) ? ['eth', 'ethereum'] :
    ['sol', 'solana'].includes(word) ? ['sol', 'solana'] : [word]);
  const seen = new Set();
  return rows.filter(row => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    const haystack = `${row.title} ${row.category} ${(row.outcomes ?? []).map(o => o.label).join(' ')}`.toLowerCase();
    return words.every(aliases => aliases.some(word => haystack.includes(word)));
  });
}
