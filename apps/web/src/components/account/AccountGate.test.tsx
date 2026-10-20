import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Star } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { AccountGate } from './AccountGate';

const initial = useSession.getState();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState(initial, true);
});

function gate() {
  render(
    <AccountGate icon={<Star />} title="Keep an eye on your picks" description="Star tokens.">
      <p>Watchlist rows</p>
    </AccountGate>,
  );
}

describe('AccountGate while a stored session is restored', () => {
  it('shows a skeleton until the first attempt fails, then the error with Retry', () => {
    useSession.setState({ token: 'tok', account: null, ready: false, restoreError: null, restoring: true });
    gate();
    expect(screen.getByLabelText('Loading account')).toBeTruthy();

    act(() => useSession.setState({ restoreError: new ApiError(503, 'Service unavailable'), restoring: false }));
    expect(screen.getByText('Couldn’t load your account')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    const retry = vi.spyOn(useSession.getState(), 'retryRestore').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByText('Keep an eye on your picks')).toBeNull();
  });
});
