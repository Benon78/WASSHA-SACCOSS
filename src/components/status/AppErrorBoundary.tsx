import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState, classifyError } from "./ErrorState";

interface Props {
  children: ReactNode;
  /** Called when an error is caught. Useful for logging. */
  onError?: (error: Error, info: ErrorInfo) => void;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Class-based error boundary that catches render-time errors thrown by
 * children. Route-level errors are handled by TanStack Router's
 * `errorComponent`; this wraps the whole shell to catch anything outside
 * the router (providers, portals, widgets).
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the console breadcrumb but avoid noisy stack duplication.
    console.error("[AppErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return (
      <ErrorState
        fullscreen
        kind={classifyError(this.state.error)}
        onRetry={this.reset}
      />
    );
  }
}
