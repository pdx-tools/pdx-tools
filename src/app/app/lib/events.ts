import type { DetectedDataType } from "@/features/engine";
import { log } from "./log";
import { posthogClient } from "./posthogClient";

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
    void posthogClient().then((posthog) => posthog?.startSessionRecording());
  }
  isRecording = true;
}

export function resetLogging() {
  void posthogClient().then((posthog) => posthog?.reset());
  identity = "";
}

let identity = "";
export function identify(userId: string) {
  if (userId !== identity) {
    identity = userId;
    void posthogClient().then((posthog) => posthog?.identify(userId));
  }
}

export function emitEvent({ kind, ...props }: Event) {
  log("Event", { kind, ...props });
  void posthogClient().then((posthog) => posthog?.capture(kind, props));
}
