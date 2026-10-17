import { setCaptureExceptionImplementation } from "@/lib/captureException";
import { setWebWorkerIntegration } from "@/lib/sentryWorker";
import { withPostHog } from "@/lib/posthogClient";

const isBrowser = typeof window !== "undefined";
const SENTRY_DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN;

export function sentryInit() {
  // Without a DSN Sentry is off, so do not download it.
  if (!isBrowser || !SENTRY_DSN) {
    return;
  }

  // Bit of a hack to dynamically import Sentry only on the client otherwise
  // cloudflare warns about importing react-router sentry on the server (which
  // appears to crash the render).
  import("@sentry/react-router")
    .then((Sentry) => {
      const webWorker = Sentry.webWorkerIntegration({ worker: [] });
      Sentry.init({
        dsn: SENTRY_DSN,
        tracesSampleRate: 0.0,
        debug: !import.meta.env.PROD,
        tunnel: "/api/tunnel",
        ignoreErrors: ["ResizeObserver loop completed with undelivered notifications."],
        integrations: [webWorker],
      });

      // PostHog loads after the page, so add its integration when it is ready.
      withPostHog((posthog) => {
        Sentry.addIntegration(
          posthog.sentryIntegration({
            organization: import.meta.env.VITE_SENTRY_ORG,

            // Take everything after the last slash in the DSN
            projectId: +(SENTRY_DSN?.split("/").pop() ?? "0"),
          }),
        );
      });

      setWebWorkerIntegration(webWorker);
      setCaptureExceptionImplementation((exception, captureContext) =>
        Sentry.captureException(exception, captureContext),
      );
    })
    .catch((error) => {
      setCaptureExceptionImplementation(undefined);
      console.error("Failed to initialize Sentry", error);
    });
}
