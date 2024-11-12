import React, { type ErrorInfo } from "react";
import { getErrorMessage } from "@/lib/getErrorMessage";
import { captureException } from "@/lib/captureException";
import { Alert } from "@/components/Alert";

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

  override componentDidCatch(error: Error, { componentStack }: ErrorInfo) {
    const errorBoundaryError = new Error(error.message);
    errorBoundaryError.name = `React ErrorBoundary ${errorBoundaryError.name}`;
    errorBoundaryError.stack = componentStack || undefined;
    error.cause = errorBoundaryError;
    captureException(error, { contexts: { react: { componentStack } } });
    this.setState({ error });
  }

  override render() {
    if (this.state.error) {
      return (
        <Alert className="px-4 py-2" variant="error">
          <Alert.Description>
            Error encountered: {getErrorMessage(this.state.error)}. Recommended
            to refresh. If the error continues, please report the issue via
            Discord
          </Alert.Description>
        </Alert>
      );
    }
    return this.props.children;
  }
}
