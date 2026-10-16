import { expect, it, vi } from "vitest";

it("does not register recycled workers when Sentry finishes loading", async () => {
  vi.resetModules();
  const { trackWorker, setWebWorkerIntegration } = await import("./sentryWorker");
  const recycled = {} as Worker;
  const live = {} as Worker;
  trackWorker(recycled)();
  trackWorker(live);
  const addWorker = vi.fn();
  setWebWorkerIntegration({ addWorker } as unknown as Parameters<
    typeof setWebWorkerIntegration
  >[0]);
  expect(addWorker).toHaveBeenCalledOnce();
  expect(addWorker).toHaveBeenCalledWith(live);
});

it("registers workers immediately when Sentry is ready", async () => {
  vi.resetModules();
  const { trackWorker, setWebWorkerIntegration } = await import("./sentryWorker");
  const addWorker = vi.fn();
  setWebWorkerIntegration({ addWorker } as unknown as Parameters<
    typeof setWebWorkerIntegration
  >[0]);
  const worker = {} as Worker;
  trackWorker(worker)();
  expect(addWorker).toHaveBeenCalledWith(worker);
});
