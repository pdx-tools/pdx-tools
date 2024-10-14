import { DetectedDataType } from "@/features/engine";
import posthog from "posthog-js";
import { log } from "./log";

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
      kind: "Timelapse playing" | "Login click" | "Register click";
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
      kind: "$pageview";
      maxSize: number | null;
      performanceCaveat: boolean | null;
      offscreenCanvas: boolean;
      supportedEnvironment: boolean;
    }
  | {
      kind: "Budget interval switched";
      interval: string;
    };

let isRecording = false;
export function startSessionRecording() {
  if (!isRecording) {
    posthog.startSessionRecording();
  }
  isRecording = true;
}

export function resetLogging() {
  posthog.reset();
  identity = "";
}

let identity = "";
export function identify(userId: string) {
  if (userId !== identity) {
    identity = userId;
    posthog.identify(userId);
  }
}

export function emitEvent({ kind, ...props }: Event) {
  log("Event", { kind, ...props });
  if (process.env.NODE_ENV === "production") {
    posthog.capture(kind, props);
  }
}
