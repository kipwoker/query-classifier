export interface Vote<T> {
  value: T;
  agreement: number;
}

// Self-consistency (Wang et al., 2022): sample the weak model N times and
// majority-vote, instead of pattern-matching the query text. Purely
// structural comparison of the model's own repeated outputs - no wording
// or language assumptions, so it works the same regardless of the query's
// language or phrasing.
export function majorityVote<T>(values: T[]): Vote<T> {
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    const key = JSON.stringify(value);
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
    } else {
      counts.set(key, { value, count: 1 });
    }
  }
  let best: { value: T; count: number } | undefined;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best) {
    throw new Error("majorityVote called with an empty array");
  }
  return { value: best.value, agreement: best.count / values.length };
}
