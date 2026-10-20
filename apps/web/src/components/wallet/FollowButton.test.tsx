// Following / unfollowing with the star keeps keyboard focus on the star:
// both states render the same button element.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account, FollowedWallet } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { FollowButton } from './FollowButton';

const W = 'K83fWalletAddress1111111111111111111111111';
const initial = useSession.getState();
const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get(this: HTMLElement) { return this.isConnected ? this.parentElement : null; } });
});
afterAll(() => {
  if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', desc);
});

beforeEach(() => {
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: {} } as unknown as Account, ready: true });
  vi.spyOn(api, 'follows').mockResolvedValue([]);
  vi.spyOn(api, 'follow').mockImplementation(async (b) => ({ chain: 'sol', address: b.address, remark: '', group: 'Default', notify: false }) as FollowedWallet);
  vi.spyOn(api, 'unfollow').mockResolvedValue({ ok: true } as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

describe('FollowButton (star)', () => {
  it('keeps focus on the star when following and when unfollowing from the editor', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <FollowButton chain="sol" address={W} variant="icon" size="sm" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Named after the wallet (short address when it has no label), not just "wallet".
    const star = await screen.findByRole('button', { name: /^Follow K83f/ });
    expect(star.getAttribute('aria-haspopup')).toBeNull();
    act(() => star.focus());
    fireEvent.click(star);
    await waitFor(() => expect(star.getAttribute('aria-label')).toMatch(/^Following K83f.* — edit$/));
    expect(document.activeElement).toBe(star);
    expect(star.isConnected).toBe(true);

    fireEvent.click(star);
    const unfollow = await screen.findByRole('button', { name: 'Unfollow' });
    act(() => unfollow.focus());
    await act(async () => fireEvent.click(unfollow));
    await waitFor(() => expect(star.getAttribute('aria-label')).toMatch(/^Follow K83f/));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(star);
  });
});
