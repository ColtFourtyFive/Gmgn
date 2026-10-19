import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui';

interface Props {
  /** Changing this (the pathname) clears a caught error, so navigating away recovers. */
  resetKey: string;
  children: ReactNode;
}

interface State {
  error: unknown;
  resetKey: string;
}

/**
 * Catches render errors in the routed page (including failed lazy chunk
 * loads) so the shell, navigation and toasts keep working.
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
    if (!this.state.error) return this.props.children;
    return <ErrorState title="This page crashed" error={this.state.error} onRetry={() => this.setState({ error: null })} className="min-h-[50vh]" />;
  }
}
