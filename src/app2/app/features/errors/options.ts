import { isEnvironmentSupported } from "@/lib/compatibility";
import type { init } from "@sentry/react";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
const production = process.env.NODE_ENV === "production";

export const sentryOptions: Parameters<typeof init>[0] = {
  dsn: SENTRY_DSN,
  tracesSampleRate: 0.0,
  enabled: production,
  tunnel: production ? "/api/tunnel" : undefined,
  ignoreErrors: [
    "ResizeObserver loop completed with undelivered notifications.",
  ],
  beforeSend: (event, _hint) => {
    return isEnvironmentSupported() ? event : null;
  },
};
