import { captureException as sentryCaptureException } from "@sentry/browser";

type CaptureException = typeof sentryCaptureException;

export const captureException = async (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1]
) => {
  return sentryCaptureException(exception, captureContext);
};
