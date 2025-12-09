import { PostHog } from "posthog-node";
import { log } from "./logging";

const enabled = import.meta.env.PROD && import.meta.env.VITE_POSTHOG_KEY;
function createPostHogClient() {
  return new PostHog(import.meta.env.VITE_POSTHOG_KEY, {
    host: "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    disabled: !enabled,
  });
}

let postHogClient: ReturnType<typeof createPostHogClient> | undefined;
export function getPostHogClient() {
  return (postHogClient ??= createPostHogClient());
}

export async function flushEvents() {
  if (enabled) {
    await getPostHogClient()
      .flush()
      .catch((ex) => {
        log.exception(ex, { msg: "posthog error" });
      });
  }
}

export function captureEvent({
  userId,
  event,
  ...rest
}: { userId: string; event: string } & Record<string, string>) {
  log.info({ event, user: userId, ...rest });
  if (enabled) {
    getPostHogClient().capture({ distinctId: userId, event, properties: rest });
  }
}
