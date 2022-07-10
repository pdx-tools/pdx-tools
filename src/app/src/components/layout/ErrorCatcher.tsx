import React from "react";
import { Alert, message } from "antd";
import { ErrorBoundary } from "@sentry/nextjs";
import { getErrorMessage } from "@/lib/getErrorMessage";

interface ErrorCatcherProps {
  children: React.ReactNode;
}

export const ErrorCatcher = ({ children }: ErrorCatcherProps) => {
  return (
    <ErrorBoundary
      fallback={({ error }) => {
        return (
          <Alert
            type="error"
            closable
            message={`Error encountered: ${getErrorMessage(
              error
            )}. Recommended to refresh. If the error continues, please report the issue via Discord`}
          />
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
};
