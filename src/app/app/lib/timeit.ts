import { formatInt } from "./format";
import { log } from "./log";

export async function timeit<T>(fn: () => T | Promise<T>) {
  const start = performance.now();
  const result = await Promise.resolve(fn());
  const end = performance.now();
  return { data: result, elapsedMs: end - start };
}

type TimeLabel<T> = string | ((result: T) => string);

export function timeSync<T>(label: TimeLabel<T>, fn: () => T) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  logDuration(label, result, end - start);
  return result;
}

export async function timeAsync<T>(
  label: TimeLabel<T>,
  fn: () => T | Promise<T>,
) {
  const start = performance.now();
  const result = await Promise.resolve(fn());
  const end = performance.now();
  logDuration(label, result, end - start);
  return result;
}

function logDuration<T>(label: TimeLabel<T>, result: T, elapsedMs: number) {
  const resolvedLabel = typeof label === "function" ? label(result) : label;
  const ms = formatInt(elapsedMs).padStart(5, " ");
  log(`[${ms}ms] ${resolvedLabel}`);
}
