import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui';
import { isChunkLoadError } from '@/lib/format';

interface Props {
  /** Changing this (the pathname) clears a caught error, so navigating away recovers. */
  resetKey: string;
  children: ReactNode;
  /** Full page reload (a seam for tests). */
  onReload?: () => void;
}

interface State {
  error: unknown;
  resetKey: string;
}

/**
 * Catches render errors in the routed page so the shell, navigation and
 * toasts keep working. A failed lazy chunk load is not a crash: React caches
 * the rejected import, so Retry or navigating back would only rethrow it;
 * that case offers a full reload instead.
 */
export class PageErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('Unknown error') };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[page] render error', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (isChunkLoadError(error))
      return (
        <ErrorState
          title="Couldn’t load this page"
          error={error}
          retryLabel="Reload"
          onRetry={this.props.onReload ?? (() => window.location.reload())}
          className="min-h-[50vh]"
        />
      );
    return <ErrorState title="This page crashed" error={error} onRetry={() => this.setState({ error: null })} className="min-h-[50vh]" />;
  }
}
