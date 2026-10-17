/** Stable JSON used for evidence hashes, so the same facts always give the same hash. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}

/** UTC text for the resolver form's datetime-local field, never earlier than the market close. */
export function observedAtField(closeMs, nowMs) {
  return new Date(Math.max(closeMs, nowMs)).toISOString().slice(0, 16);
}
