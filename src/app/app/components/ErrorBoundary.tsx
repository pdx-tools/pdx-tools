import React from "react";
import * as Sentry from "@sentry/remix";

type FallbackRender = (errorData: {
  error: unknown;
  componentStack: string;
  eventId: string;
  resetError(): void;
}) => React.ReactElement;

export function ErrorBoundary({
  children,
  fallback,
}: React.PropsWithChildren<{
  fallback?: React.ReactElement | FallbackRender;
}>) {
  return (
    <Sentry.ErrorBoundary fallback={fallback}>{children}</Sentry.ErrorBoundary>
  );
}
