export function groupBy<T, K>(items: T[], fn: (arg0: T) => K): Map<K, T[]> {
  const result: Map<K, T[]> = new Map();
  for (const item of items) {
    const key = fn(item);
    const existing = result.get(key);
    result.set(key, [...(existing ?? []), item]);
  }
  return result;
}
