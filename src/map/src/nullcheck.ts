export function notNull<T>(x: T | null): T {
  if (x === null) {
    throw new Error("unexpected null");
  } else {
    return x;
  }
}
