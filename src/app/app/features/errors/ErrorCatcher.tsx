import React from "react";
import type { ErrorInfo } from "react";
import { captureException } from "@/lib/captureException";

interface ErrorCatcherProps {
  children: React.ReactNode;
  fallback: (errorData: {
    error: unknown;
    componentStack?: string | null;
    resetError(): void;
    eventId?: string | null;
  }) => React.ReactElement;
  onReset?: () => void;
}

interface ErrorCatcherState {
  error: unknown | null;
  componentStack?: string | null;
  eventId?: string | null;
}

export class ErrorCatcher extends React.Component<
  ErrorCatcherProps,
  ErrorCatcherState
> {
  constructor(props: ErrorCatcherProps) {
    super(props);
    this.state = { error: null, componentStack: null, eventId: null };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: Error, { componentStack }: ErrorInfo) {
    const errorCatcherError = new Error(error.message);
    errorCatcherError.name = `React ErrorCatcher ${errorCatcherError.name}`;
    errorCatcherError.stack = componentStack || undefined;
    error.cause = errorCatcherError;
    const eventId =
      captureException(error, { contexts: { react: { componentStack } } }) ??
      null;
    this.setState({ error, componentStack, eventId });
  }

  private resetError = () => {
    this.props.onReset?.();
    this.setState({ error: null, componentStack: null, eventId: null });
  };

  override render() {
    const { fallback } = this.props;
    const { error, componentStack, eventId } = this.state;

    if (this.state.error) {
      return fallback({
        error,
        componentStack,
        eventId,
        resetError: this.resetError,
      });
    }
    return this.props.children;
  }
}
