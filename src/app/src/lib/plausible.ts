import { DetectedDataType } from "@/features/engine";

declare global {
  interface Window {
    plausible: any;
  }
}

function getPlausible() {
  return (window.plausible =
    window.plausible ||
    function () {
      // Putting this defensive conditional here as there are reports in
      // sentry as plausible being undefined and I'm not sure how it's
      // happening.
      if (window.plausible) {
        (window.plausible.q = window.plausible.q || []).push(arguments);
      }
    });
}

export type Event =
  | {
      kind: "parse" | "melt" | "download";
      game: DetectedDataType;
    }
  | {
      kind: "webgl";
      maxSize: number | null;
      performanceCaveat: boolean | null;
    };

export function emitEvent({ kind, ...props }: Event) {
  getPlausible()(kind, { props });
}
