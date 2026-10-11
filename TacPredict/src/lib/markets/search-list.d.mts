export function searchListings<T extends { id: string; title: string; category: string; outcomes?: { label: string }[] }>(rows: T[], query?: string): T[];
