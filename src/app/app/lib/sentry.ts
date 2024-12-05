import { isEnvironmentSupported } from "@/lib/compatibility";
import { isProduction } from "@/server-lib/env";
import * as Sentry from "@sentry/remix";

const SENTRY_DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN;
export const sentryInit = () =>
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.0,
    enabled: !!SENTRY_DSN,
    debug: !isProduction(),
    tunnel: "/api/tunnel",
    ignoreErrors: [
      "ResizeObserver loop completed with undelivered notifications.",
    ],
    beforeSend: (event, _hint) => {
      return isEnvironmentSupported() ? event : null;
    },
  });
