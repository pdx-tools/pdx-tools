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

export type Event = "Eu4Parse" | "Melt" | "Analysis";

export function emitEvent(event: Event, props?: Record<any, any>) {
  const plausible = getPlausible();
  plausible(event, { props });
}
