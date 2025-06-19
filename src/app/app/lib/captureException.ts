import * as Sentry from "@sentry/react-router";

type CaptureException = typeof Sentry["captureException"];

export const captureException = (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1],
) => {
  if (exception && typeof exception === "object" && "stack" in exception) {
    console.error(exception, exception.stack);
  } else {
    console.error(exception);
  }
  return Sentry.captureException(exception, captureContext);
};
