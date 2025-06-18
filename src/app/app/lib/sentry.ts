import { isEnvironmentSupported } from "@/lib/compatibility";
import * as Sentry from "@sentry/react-router";

const SENTRY_DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN;
export const sentryInit = () =>
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.0,
    enabled: !!SENTRY_DSN,
    debug: !import.meta.env.PROD,
    tunnel: "/api/tunnel",
    integrations: [
      ...(typeof Sentry.reactRouterTracingIntegration === 'function' 
        ? [Sentry.reactRouterTracingIntegration()] 
        : []),
    ],
    ignoreErrors: [
      "ResizeObserver loop completed with undelivered notifications.",
    ],
    beforeSend: (event, _hint) => {
      return isEnvironmentSupported() ? event : null;
    },
  });
