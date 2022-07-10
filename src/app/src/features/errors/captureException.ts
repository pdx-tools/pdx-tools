import { sentryOptions } from "./options";
import type { captureException as sentryCaptureException } from "@sentry/browser";

type CaptureException = typeof sentryCaptureException;
let sentryFetch: undefined | Promise<CaptureException>;

export const captureException = async (
  exception: Parameters<CaptureException>[0],
  captureContext?: Parameters<CaptureException>[1]
) => {
  if (sentryFetch === undefined) {
    sentryFetch = import("@sentry/browser").then((Sentry) => {
      Sentry.init(sentryOptions);
      return Sentry.captureException;
    });
  }

  const fn = await sentryFetch;
  fn(exception, captureContext);
};
