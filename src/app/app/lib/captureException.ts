import { captureException as sentryCaptureException } from "@sentry/react-router";

type CaptureException = typeof sentryCaptureException;

export const captureException = (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1],
) => {
  if (exception && typeof exception === "object" && "stack" in exception) {
    console.error(exception, exception.stack);
  } else {
    console.error(exception);
  }
  return sentryCaptureException(exception, captureContext);
};
