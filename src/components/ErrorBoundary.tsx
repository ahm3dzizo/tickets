import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-red-500/20 rounded-2xl p-8 text-center space-y-4 shadow-2xl shadow-black/10">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">âš ï¸</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
              We encountered an unexpected error. Please try refreshing the page.
            </p>
            {this.state.error && (
              <pre className="text-left bg-black/50 p-4 rounded-lg text-xs text-red-400 overflow-auto max-h-40">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
