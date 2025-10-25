import { setCaptureExceptionImplementation } from "@/lib/captureException";
import { isEnvironmentSupported } from "@/lib/compatibility";
import posthog from "posthog-js";

const isBrowser = typeof window !== "undefined";
const SENTRY_DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN;

export function sentryInit() {
  if (!isBrowser) {
    return;
  }

  // Bit of a hack to dynamically import Sentry only on the client otherwise
  // cloudflare warns about importing react-router sentry on the server (which
  // appears to crash the render).
  import("@sentry/react-router")
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        tracesSampleRate: 0.0,
        enabled: !!SENTRY_DSN,
        debug: !import.meta.env.PROD,
        tunnel: "/api/tunnel",
        ignoreErrors: [
          "ResizeObserver loop completed with undelivered notifications.",
        ],
        beforeSend: (event, _hint) => {
          return isEnvironmentSupported() ? event : null;
        },
        integrations: [
          posthog.sentryIntegration({
            organization: import.meta.env.VITE_SENTRY_ORG,

            // Take everything after the last slash in the DSN
            projectId: +(SENTRY_DSN?.split("/").pop() ?? "0"),
          }),
        ],
      });

      setCaptureExceptionImplementation((exception, captureContext) =>
        Sentry.captureException(exception, captureContext),
      );
    })
    .catch((error) => {
      setCaptureExceptionImplementation(undefined);
      console.error("Failed to initialize Sentry", error);
    });
}
