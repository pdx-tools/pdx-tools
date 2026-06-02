import type { captureException as SentryCaptureException } from "@sentry/react-router";
import { isStaleVersion } from "@/lib/staleVersion";

type CaptureException = typeof SentryCaptureException;
type CaptureExceptionImpl = (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1],
) => ReturnType<CaptureException>;

let captureImplementation: CaptureExceptionImpl | undefined;

export const captureException = (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1],
): ReturnType<CaptureException> | undefined => {
  if (exception !== null && typeof exception === "object" && "stack" in exception) {
    console.error(exception, exception.stack);
  } else {
    console.error(exception);
  }

  if (isStaleVersion()) {
    return undefined;
  }

  return captureImplementation?.(exception, captureContext);
};

export const setCaptureExceptionImplementation = (
  implementation: CaptureExceptionImpl | undefined,
) => {
  captureImplementation = implementation;
};
