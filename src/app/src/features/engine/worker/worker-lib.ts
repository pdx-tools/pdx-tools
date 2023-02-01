export async function timeit<T>(fn: () => T | Promise<T>) {
  const start = performance.now();
  const result = await Promise.resolve(fn());
  const end = performance.now();
  const res: [T, number] = [result, end - start];
  return res;
}

export async function timeit2<T>(fn: () => T | Promise<T>) {
  const start = performance.now();
  const result = await Promise.resolve(fn());
  const end = performance.now();
  return { data: result, elapsedMs: end - start };
}
