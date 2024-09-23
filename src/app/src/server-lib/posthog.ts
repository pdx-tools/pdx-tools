import { PostHog } from "posthog-node";
import { log } from "./logging";

function createPostHogClient() {
  return new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    disabled:
      process.env.NODE_ENV === "development" ||
      !process.env.NEXT_PUBLIC_POSTHOG_KEY,
  });
}

let postHogClient: ReturnType<typeof createPostHogClient> | undefined;
export function getPostHogClient() {
  return (postHogClient ??= createPostHogClient());
}

export async function flushEvents() {
  try {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      // TODO: use `waituntil`
      await getPostHogClient().shutdown();
    }
  } catch (ex) {
    log.exception(ex, { msg: "posthog error" });
  }
}

export function captureEvent({
  userId,
  event,
  ...rest
}: { userId: string; event: string } & Record<string, string>) {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    getPostHogClient().capture({ distinctId: userId, event, properties: rest });
  }
}
