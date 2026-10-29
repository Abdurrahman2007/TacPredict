/** Public read requests only. Never use for wallet/account data, trade intents or transactions.
 * In-flight deduplication is isolate-local: no fulfilled-value cache, TTL or stale fallback.
 */
export function createReadCoalescer(limit = 4) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 32)
    throw Error("Invalid catalogue concurrency limit");
  const flights = new Map<string, Promise<unknown>>();
  return function coalesce<T>(
    identity: readonly (string | null)[],
    load: () => Promise<T>,
  ): Promise<T> {
    if (
      identity.length < 1 ||
      identity.length > 8 ||
      identity.some((part) => part !== null && typeof part !== "string")
    )
      return Promise.reject(Error("Invalid catalogue identity"));
    // Identity may contain server RPC credentials. Never log, export or return this key.
    const key = JSON.stringify(identity);
    const existing = flights.get(key);
    if (existing) return existing as Promise<T>;
    if (flights.size >= limit) return Promise.reject(Error("Virtual catalogue reads busy; retry"));
    const tracked: Promise<T> = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (flights.get(key) === tracked) flights.delete(key);
          return value;
        },
        (error: unknown) => {
          if (flights.get(key) === tracked) flights.delete(key);
          throw error;
        },
      );
    flights.set(key, tracked);
    return tracked;
  };
}
export const coalesceCatalogue = createReadCoalescer();
