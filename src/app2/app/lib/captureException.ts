import { captureException as sentryCaptureException } from "@sentry/browser";

type CaptureException = typeof sentryCaptureException;

export const captureException = async (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1],
) => {
  if (typeof exception === "object" && "stack" in exception) {
    console.error(exception, exception.stack);
  } else {
    console.error(exception);
  }
  return sentryCaptureException(exception, captureContext);
};
