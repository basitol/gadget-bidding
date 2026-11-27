import React from 'react';
import { Sentry } from '../config/sentry';
import { ErrorState, errorCodeFrom } from './states';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  code?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      console.error('Unhandled error caught by ErrorBoundary:', error, info);
    }
    // The code on screen is the start of the Sentry event id, so support can find the report.
    const eventId = Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    this.setState({ code: errorCodeFrom(eventId) });
  }

  reset = () => this.setState({ hasError: false, code: undefined });

  render() {
    if (this.state.hasError) {
      return <ErrorState code={this.state.code ?? errorCodeFrom()} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
