const PARSE_API_HEALTH = "http://localhost:8081/healthz";
const APP_URL = "http://localhost:3000";

const READY_TIMEOUT_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry failed requests until the server is ready or the time limit expires.
export async function waitForReady(
  name: string,
  url: string,
  isReady: (resp: Response) => boolean,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("readiness request timed out")),
      Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()),
    );
    try {
      const resp = await fetch(url, { redirect: "manual", signal: controller.signal });
      const ready = isReady(resp);
      await resp.body?.cancel();
      if (ready) {
        return;
      }
      lastError = new Error(`unexpected status ${resp.status}`);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timeout);
    }
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await sleep(Math.min(POLL_INTERVAL_MS, remaining));
    }
  }
  throw new Error(`${name} not ready at ${url} after ${READY_TIMEOUT_MS}ms: ${lastError}`);
}

export default async function setup() {
  await Promise.all([
    waitForReady("parse API", PARSE_API_HEALTH, (resp) => resp.status === 200),
    waitForReady("app server", APP_URL, (resp) => resp.status >= 200 && resp.status < 400),
  ]);
}
