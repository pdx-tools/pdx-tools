import posthog from "posthog-js";

export const captureException = (
  exception: Error,
  captureContext?: Record<string, string>,
) => {
  posthog.captureException(exception, captureContext);
};
