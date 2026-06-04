const PARSE_API_HEALTH = "http://localhost:8081/healthz";
const APP_URL = "http://localhost:3000";

const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Poll `url` until `isReady` returns true. A thrown fetch (ECONNREFUSED while the
// server is still binding) counts as "not ready yet" and is retried.
async function waitForReady(
  name: string,
  url: string,
  isReady: (resp: Response) => boolean,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url, { redirect: "manual" });
      if (isReady(resp)) {
        return;
      }
      lastError = new Error(`unexpected status ${resp.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${name} not ready at ${url} after ${READY_TIMEOUT_MS}ms: ${lastError}`);
}

export default async function setup() {
  await Promise.all([
    // The parse API is the one that loses the startup race the most; require a
    // real 200 so we know the router is serving, not just that the port is open.
    waitForReady("parse API", PARSE_API_HEALTH, (resp) => resp.ok),
    // The app server only needs to be reachable; any HTTP response (incl.
    // redirects) means it is listening.
    waitForReady("app server", APP_URL, () => true),
  ]);
}
