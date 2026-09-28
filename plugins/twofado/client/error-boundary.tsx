import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  label: string;
  fallback: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[2fado] ${this.props.label} render failed:`, error, info.componentStack);
    // TEMPORARY DIAGNOSTICS (#555) — strip once cause is known.
    try {
      console.warn(`[2fado] ${this.props.label} error.message:`, error?.message);
    } catch (err) {
      console.warn(`[2fado] ${this.props.label} probe failed:`, err);
    }
    try {
      console.warn(`[2fado] ${this.props.label} error.stack:`, error?.stack);
    } catch (err) {
      console.warn(`[2fado] ${this.props.label} probe failed:`, err);
    }
    try {
      console.warn(`[2fado] ${this.props.label} componentStack:`, info?.componentStack);
    } catch (err) {
      console.warn(`[2fado] ${this.props.label} probe failed:`, err);
    }
    // The crash Null throws carry a decoded element type on the error itself.
    try {
      const asRecord = error as unknown as Record<string, unknown>;
      const ownProps = Object.getOwnPropertyNames(asRecord ?? {}).join(",");
      console.warn(`[2fado] ${this.props.label} error.ownProps: ${ownProps}`);
      for (const key of ["elementType", "componentStack", "errorInfo", "type", "name"]) {
        const value = asRecord?.[key];
        console.warn(
          `[2fado] ${this.props.label} error.${key}: ${typeof value}`,
          value === undefined ? undefined : String(value),
        );
      }
    } catch (err) {
      console.warn(`[2fado] ${this.props.label} error-fields probe failed:`, err);
    }
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}
