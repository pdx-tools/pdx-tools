import type { PostHog } from "posthog-js";

let client: Promise<PostHog | null> | undefined;

/**
 * Run `fn` with the PostHog client when it is ready. The client is downloaded
 * and started on first use. `fn` does not run when analytics is off or
 * PostHog did not start.
 */
export function withPostHog(fn: (posthog: PostHog) => void) {
  client ??= startPostHog().catch((error: unknown) => {
    console.warn("Failed to start PostHog", error);
    return null;
  });
  void client.then((posthog) => posthog && fn(posthog));
}

async function startPostHog(): Promise<PostHog | null> {
  if (!import.meta.env.PROD || !import.meta.env.VITE_POSTHOG_KEY) {
    return null;
  }

  // Test to see if PostHog is causing EU5 flicker issues
  if (localStorage.getItem("ph_disabled")) {
    return null;
  }

  const { default: posthog } = await import("posthog-js");
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    autocapture: false,
    disable_session_recording: true,
    capture_dead_clicks: false,
    ui_host: "https://eu.posthog.com",
    api_host: "/ph",
    person_profiles: "identified_only",
    persistence: "localStorage",
    capture_pageview: false,
    capture_pageleave: true,
  });
  return posthog;
}
