export async function timeit<T>(fn: () => T | Promise<T>) {
  const start = performance.now();
  const result = await Promise.resolve(fn());
  const end = performance.now();
  return { data: result, elapsedMs: end - start };
}

export function timeSync<T>(fn: () => T) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  return { data: result, elapsedMs: end - start };
}
