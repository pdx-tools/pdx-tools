import React, { ErrorInfo } from "react";
import { Alert } from "antd";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { captureException } from "./captureException";

interface ErrorCatcherProps {
  children: React.ReactNode;
}

interface ErrorCatcherState {
  error: any;
}

export class ErrorCatcher extends React.Component<
  ErrorCatcherProps,
  ErrorCatcherState
> {
  constructor(props: ErrorCatcherProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { error };
  }

  componentDidCatch(error: Error, { componentStack }: ErrorInfo) {
    const errorBoundaryError = new Error(error.message);
    errorBoundaryError.name = `React ErrorBoundary ${errorBoundaryError.name}`;
    errorBoundaryError.stack = componentStack;
    error.cause = errorBoundaryError;
    captureException(error, { contexts: { react: { componentStack } } });
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          type="error"
          closable
          message={`Error encountered: ${getErrorMessage(
            this.state.error
          )}. Recommended to refresh. If the error continues, please report the issue via Discord`}
        />
      );
    }
    return this.props.children;
  }
}
