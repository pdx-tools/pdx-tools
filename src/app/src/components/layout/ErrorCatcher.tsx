import React from "react";
import { Alert, message } from "antd";
import { ErrorBoundary } from "@sentry/react";
import { getErrorMessage } from "@/lib/getErrorMessage";

export const ErrorCatcher: React.FC<{}> = ({ children }) => {
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
