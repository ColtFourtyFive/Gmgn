import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AppNotification } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { NotificationsBell } from './NotificationsBell';

const initial = useSession.getState();
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState(initial, true);
});

const note = (id: string): AppNotification => ({ id, kind: 'alert', title: `Note ${id}`, body: '', chain: null, token: null, wallet: null, createdAt: 0, read: false }) as AppNotification;

describe('Notifications "Mark all read"', () => {
  it('keeps focus when it has nothing left to do', async () => {
    useSession.setState({ token: 'tok' });
    vi.spyOn(api, 'notifications').mockResolvedValue([note('a'), note('b')]);
    const markRead = vi.spyOn(api, 'markRead').mockResolvedValue({ ok: true });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <NotificationsBell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications (2 unread)' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
    const button = await screen.findByRole('button', { name: 'Mark all read' });
    act(() => button.focus());
    fireEvent.click(button);
    expect(markRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
    // Still focusable and focused (a disabled button would have dropped focus to <body>).
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(markRead).toHaveBeenCalledTimes(1);
  });
});
