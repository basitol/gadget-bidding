import React from 'react';
import { Sentry } from '../config/sentry';
import { ErrorFallback } from './ErrorFallback';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (__DEV__) {
      console.error('Unhandled error caught by ErrorBoundary:', error, info);
    }
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return <ErrorFallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
