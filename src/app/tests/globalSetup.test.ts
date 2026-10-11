import { afterEach, beforeEach, expect, test, vi } from "vitest";
import setup, { waitForReady } from "./globalSetup";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("startup waits for the app to recover from a server error", async () => {
  let appRequests = 0;
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith("/healthz")) {
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: ++appRequests === 1 ? 500 : 200 });
  });
  vi.stubGlobal("fetch", fetch);

  const ready = setup();
  await vi.advanceTimersByTimeAsync(250);
  await ready;
  expect(appRequests).toBe(2);
});

test("stalled requests stop at the startup deadline", async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, options: RequestInit) => {
      const signal = options.signal!;
      signals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }),
  );

  const ready = waitForReady("test server", "http://localhost", (resp) => resp.ok);
  const failure = expect(ready).rejects.toThrow(
    "after 60000ms: Error: readiness request timed out",
  );
  await vi.advanceTimersByTimeAsync(60_000);
  await failure;
  expect(signals.length).toBeGreaterThan(1);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
