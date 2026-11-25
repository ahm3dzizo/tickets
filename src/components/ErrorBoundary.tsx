import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function isChunkLoadError(error: Error | null): boolean {
  const message = error?.message || '';
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d]+ failed/i.test(message);
}

function recoverFromStaleChunk(error: Error | null): void {
  if (!isChunkLoadError(error)) return;

  // A deployment can replace index.html while an already-open tab still needs
  // an older lazy route chunk. Retry once per tab/location to avoid reload loops.
  const key = `retal:chunk-recovery:${window.location.pathname}`;
  const now = Date.now();
  try {
    const previousAttempt = Number(sessionStorage.getItem(key) || 0);
    if (previousAttempt && now - previousAttempt < 30_000) return;
    sessionStorage.setItem(key, String(now));
    window.setTimeout(() => window.location.reload(), 250);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
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
    recoverFromStaleChunk(error);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-card border border-red-500/20 rounded-2xl p-8 text-center space-y-4 shadow-2xl shadow-black/10">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">حدث خطأ غير متوقع</h1>
            <p className="text-muted-foreground text-sm">
              تعذر تحميل جزء من الصفحة. أعد تحميل التطبيق، وإذا تكرر الخطأ أرسل رمز الخطأ للدعم.
            </p>
            {this.state.error && (
              <pre dir="ltr" className="text-left bg-black/50 p-4 rounded-lg text-xs text-red-400 overflow-auto max-h-40 break-all">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all"
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
