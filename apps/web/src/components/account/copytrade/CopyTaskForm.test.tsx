import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { CopyTaskForm } from './CopyTaskForm';

const initial = useSession.getState();
const TARGET = 'So1anaTargetWa11et1111111111111111111111111';

beforeEach(() => {
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: { sol: { address: 'MyWa11et11111111111111111111111111111111111', nativeBalance: 10 } } } as unknown as Account, ready: true });
  vi.spyOn(api, 'wallet').mockReturnValue(new Promise(() => {}));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

describe('CopyTaskForm validation', () => {
  it('a market-cap range with min above max marks both bounds invalid and moves focus there', async () => {
    const create = vi.spyOn(api, 'createCopyTask');
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CopyTaskForm open onClose={() => {}} chain="sol" task={null} initialTarget={TARGET} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Market cap min' }), { target: { value: '1000000' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Market cap max' }), { target: { value: '1000' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start copying' })));

    const min = screen.getByRole('textbox', { name: 'Market cap min' });
    const max = screen.getByRole('textbox', { name: 'Market cap max' });
    expect(min.getAttribute('aria-invalid')).toBe('true');
    expect(max.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(min));
    // The focused field is described by the error.
    const note = document.getElementById(min.getAttribute('aria-describedby')!.split(' ').pop()!);
    expect(note?.textContent).toBe('Min market cap is above max.');
    expect(create).not.toHaveBeenCalled();
  });
});
