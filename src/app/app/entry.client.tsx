import { HydratedRouter } from "react-router/dom";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { sentryInit } from "./lib/sentry";
import { registerPreloadErrorHandler } from "./lib/preloadError";

sentryInit();
registerPreloadErrorHandler();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
