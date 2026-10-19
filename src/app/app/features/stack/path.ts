/**
 * The path of open levels. It never repeats an entity: opening one that is
 * already in the path goes back to it.
 */
export function pushLevel<T>(path: T[], level: T, key: (level: T) => string): T[] {
  const k = key(level);
  const at = path.findIndex((x) => key(x) === k);
  return at >= 0 ? path.slice(0, at + 1) : [...path, level];
}

/** The deepest level in the path that `pick` accepts */
export function deepest<T, R>(path: T[], pick: (level: T) => R | null): R | null {
  for (let i = path.length - 1; i >= 0; i--) {
    const x = pick(path[i]);
    if (x !== null) return x;
  }
  return null;
}
