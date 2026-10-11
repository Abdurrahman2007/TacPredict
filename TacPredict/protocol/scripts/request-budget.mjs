/** Leave room to mark a run finished and release its fenced database lease. */
export function createRequestBudget(limit, fetcher = fetch) {
  if (!Number.isInteger(limit) || limit < 8 || limit > 48)
    throw Error("Worker request budget must be an integer from 8 to 48");
  let count = 0,
    cleanup = false;
  return {
    fetch: async (...args) => {
      if (count >= (cleanup ? limit : limit - 3))
        throw Error("Bounded indexer request budget reached; resume from committed checkpoint");
      count++;
      return fetcher(...args);
    },
    releaseReserve: () => {
      cleanup = true;
    },
    count: () => count,
  };
}
