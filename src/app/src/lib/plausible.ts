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
      kind: "parse";
      game: DetectedDataType;
    }
  | {
      kind: "melt";
      game: DetectedDataType;
    };

export function emitEvent(event: Event) {
  const plausible = getPlausible();

  switch (event.kind) {
    case "melt":
    case "parse": {
      plausible(event.kind, { props: { game: event.game } });
      break;
    }
  }
}
