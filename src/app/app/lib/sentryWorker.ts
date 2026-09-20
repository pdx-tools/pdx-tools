import type { webWorkerIntegration } from "@sentry/react-router";

type WebWorkerIntegration = ReturnType<typeof webWorkerIntegration>;

let integration: WebWorkerIntegration | undefined;
const pending: Worker[] = [];

/**
 * Give Sentry access to the debug IDs of a worker's bundle and forward its
 * unhandled rejections. Without this, Sentry cannot symbolicate stack
 * frames that comlink relays from the worker. The worker must call
 * `registerWebWorker({ self })` on startup.
 *
 * Sentry loads asynchronously. Workers are created on user action, so in
 * practice Sentry is ready by then. If it is not, the worker is registered
 * once Sentry loads; only the debug IDs it posted at startup are lost.
 */
export function trackWorker(worker: Worker) {
  if (integration) {
    integration.addWorker(worker);
  } else {
    pending.push(worker);
  }
}

export function setWebWorkerIntegration(webWorker: WebWorkerIntegration) {
  integration = webWorker;
  for (const worker of pending.splice(0)) {
    webWorker.addWorker(worker);
  }
}
