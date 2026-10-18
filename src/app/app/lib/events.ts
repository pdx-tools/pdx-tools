import type { DetectedDataType } from "@/features/engine";
import { log } from "./log";
import { withPostHog } from "./posthogClient";

export type Event =
  | {
      kind: "Save parsed";
      game: DetectedDataType;
      source: "local" | "remote" | "watched";
    }
  | {
      kind: "Save melted" | "Save downloaded";
      game: DetectedDataType;
    }
  | {
      kind: "$pageview" | "Timelapse playing" | "Login click" | "Register click";
    }
  | {
      kind: "Screenshot taken" | "Timelapse recording";
      view: string;
    }
  | {
      kind: "Save watching";
      frequency: string;
    }
  | {
      kind: "Map mode switch";
      mode: string;
    }
  | {
      kind: "Country details tab change" | "World details selection";
      section: string;
    }
  | {
      kind: "Budget interval switched";
      interval: string;
    }
  | {
      kind: "Whats new clicked";
      source: "button" | "banner";
      latestRelease?: string;
    }
  | {
      kind: "Preload error";
      saveLoaded: boolean;
    };

let isRecording = false;
export function startSessionRecording() {
  if (!isRecording) {
    withPostHog((posthog) => posthog.startSessionRecording());
  }
  isRecording = true;
}

export function resetLogging() {
  withPostHog((posthog) => posthog.reset());
  identity = "";
}

let identity = "";
export function identify(userId: string) {
  if (userId !== identity) {
    identity = userId;
    withPostHog((posthog) => posthog.identify(userId));
  }
}

export function emitEvent({ kind, ...props }: Event) {
  log("Event", { kind, ...props });

  // PostHog can start after the event, so record the page and time now.
  const timestamp = new Date();
  const page = {
    $current_url: globalThis.location?.href,
    $pathname: globalThis.location?.pathname,
  };
  withPostHog((posthog) => posthog.capture(kind, { ...props, ...page }, { timestamp }));
}
