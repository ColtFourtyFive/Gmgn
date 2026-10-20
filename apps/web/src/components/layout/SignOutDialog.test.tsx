import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { AuthModal } from './AuthModal';
import { requestSignOut, SignOutDialog } from './SignOutDialog';

const initial = useSession.getState();
const guest = { id: 'g1', username: 'guest_1', isGuest: true } as Account;
const registered = { id: 'r1', username: 'alice', isGuest: false } as Account;

beforeEach(() => {
  vi.spyOn(api, 'logout').mockResolvedValue(undefined as never);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState(initial, true);
});

describe('requestSignOut', () => {
  it('asks a guest to confirm before the account is lost', async () => {
    useSession.setState({ token: 'tok', account: guest });
    render(<SignOutDialog />);
    requestSignOut();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toMatch(/cannot be recovered/);
    expect(api.logout).not.toHaveBeenCalled();
    expect(useSession.getState().token).toBe('tok');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.logout).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    requestSignOut();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(useSession.getState().token).toBeNull());
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('signs a registered account out at once', async () => {
    useSession.setState({ token: 'tok', account: registered });
    render(<SignOutDialog />);
    requestSignOut();
    await waitFor(() => expect(useSession.getState().token).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AuthModal for a guest', () => {
  it('warns on the Log in tab that the guest account will be left behind', () => {
    useSession.setState({ token: 'tok', account: guest, authPrompt: true, authTab: 'login' });
    render(
      <MemoryRouter>
        <AuthModal />
      </MemoryRouter>,
    );
    expect(screen.getByRole('dialog').textContent).toMatch(/leaves this guest account behind/);
  });
});

describe('Settings → Account', () => {
  it('signs out through the shared flow ("Sign out", guest confirmation with Register instead) and never prints the referrer id', async () => {
    const { AccountSection } = await import('@/components/account/settings/AccountSection');
    useSession.setState({
      token: 'tok',
      account: { ...guest, createdAt: 0, referralCode: 'MECTRX6', referredBy: 'acc_a112ce644d0469c9', wallets: {} } as unknown as Account,
    });
    render(
      <MemoryRouter>
        <AccountSection />
        <SignOutDialog />
      </MemoryRouter>,
    );
    expect(document.body.textContent).not.toContain('acc_a112ce644d0469c9');
    expect(screen.getByText('A referral invite')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign out of this guest account?' });
    expect(dialog.textContent).toContain('Register instead');
    expect(api.logout).not.toHaveBeenCalled();
  });
});
