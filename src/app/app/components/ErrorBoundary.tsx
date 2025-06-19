import React from "react";
import { captureException } from "@/lib/captureException";

type ErrorProps = React.PropsWithChildren<{
  fallback?: ({ error }: { error: Error }) => React.ReactElement;
}>;

export class ErrorBoundary extends React.Component<ErrorProps, {error: Error | null}> {
  constructor(props: ErrorProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    captureException(error);
  }

  override render() {
    if (this.state.error) {
      return this.props.fallback?.({ error: this.state.error });
    }

    return this.props.children;
  }
}
