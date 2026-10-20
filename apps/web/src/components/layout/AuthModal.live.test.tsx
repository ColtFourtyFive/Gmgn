// Live sign-in: no guest quick start, 10-character passwords, and a second
// step for the 6-digit code when the server answers 401 'totp_required'.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Account, AuthResponse, UserSettings } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { useToasts } from '@/store/toasts';
import { DEMO_URL, enterLive, leaveLive } from '@/testing/live';
import { AuthModal } from './AuthModal';

const initial = useSession.getState();
const settings: UserSettings = { trade: DEFAULT_TRADE, display: DEFAULT_DISPLAY };
const res: AuthResponse = { token: 'live-tok', account: { id: 'a1', username: 'alice', isGuest: false, twoFactorEnabled: true } as Account };

beforeEach(() => {
  vi.spyOn(api, 'settings').mockResolvedValue(settings);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  leaveLive();
  useSession.setState(initial, true);
  useToasts.getState().clear();
});

function open(tab: 'quick' | 'login' | 'register' | null = null) {
  useSession.setState({ authPrompt: true, authTab: tab });
  render(
    <MemoryRouter>
      <AuthModal />
    </MemoryRouter>,
  );
  return screen.getByRole('dialog');
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });

describe('AuthModal in demo', () => {
  it('keeps the guest quick start', () => {
    open();
    expect(screen.getByRole('tab', { name: 'Quick start' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Start paper trading' })).toBeTruthy();
  });
});

describe('AuthModal in live', () => {
  it('has no guest quick start: a quick-start request opens Log in', () => {
    enterLive();
    const dialog = open('quick');
    expect(screen.queryByRole('tab', { name: 'Quick start' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true');
    expect(dialog.textContent).toMatch(/real funds/);
    expect(screen.getByRole('link', { name: /Try the demo/ }).getAttribute('href')).toBe(DEMO_URL);
  });

  it('asks for a 10-character password when registering', () => {
    enterLive();
    const register = vi.spyOn(api, 'register');
    open('register');
    expect(screen.getByText('At least 10 characters.')).toBeTruthy();
    expect(field('Password').minLength).toBe(10);
    type('Username', 'alice');
    type('Password', 'short-pw');
    fireEvent.submit(field('Password').form!);
    expect(screen.getByRole('alert').textContent).toBe('Use at least 10 characters for your password.');
    expect(register).not.toHaveBeenCalled();
  });

  it('asks for the 2FA code after a totp_required answer, then signs in with it', async () => {
    enterLive();
    const login = vi
      .spyOn(api, 'login')
      .mockRejectedValueOnce(new ApiError(401, 'two-factor code required', 'totp_required'))
      .mockRejectedValueOnce(new ApiError(401, 'invalid two-factor code', 'totp_required'))
      .mockResolvedValueOnce(res);
    open('login');
    type('Username', 'alice');
    type('Password', 'correct horse battery');
    fireEvent.submit(field('Password').form!);

    const code = await screen.findByLabelText('Authentication code');
    expect(screen.getByRole('form', { name: 'Two-step verification' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull(); // the first answer is a step, not a failure
    expect(login).toHaveBeenNthCalledWith(1, 'alice', 'correct horse battery');

    fireEvent.change(code, { target: { value: '123 456' } });
    expect((code as HTMLInputElement).value).toBe('123456');
    fireEvent.submit(code.closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/That code didn’t work/));
    expect(login).toHaveBeenNthCalledWith(2, 'alice', 'correct horse battery', '123456');
    expect((screen.getByLabelText('Authentication code') as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getByLabelText('Authentication code'), { target: { value: '654321' } });
    fireEvent.submit(screen.getByLabelText('Authentication code').closest('form')!);
    await waitFor(() => expect(useSession.getState().token).toBe('live-tok'));
    expect(login).toHaveBeenNthCalledWith(3, 'alice', 'correct horse battery', '654321');
    expect(useSession.getState().authPrompt).toBe(false);
    expect(useToasts.getState().toasts.at(-1)?.body).toMatch(/Deposit SOL/);
  });

  it('accepts a recovery code on the second step', async () => {
    enterLive();
    const login = vi
      .spyOn(api, 'login')
      .mockRejectedValueOnce(new ApiError(401, 'two-factor code required', 'totp_required'))
      .mockResolvedValueOnce(res);
    open('login');
    type('Username', 'alice');
    type('Password', 'correct horse battery');
    fireEvent.submit(field('Password').form!);
    const code = await screen.findByLabelText('Authentication code');
    expect(screen.getByText('Lost your device? Use one of your recovery codes.')).toBeTruthy();
    fireEvent.change(code, { target: { value: 'ABCD-EFGH-JKMN' } });
    fireEvent.submit(code.closest('form')!);
    await waitFor(() => expect(useSession.getState().token).toBe('live-tok'));
    expect(login).toHaveBeenLastCalledWith('alice', 'correct horse battery', 'ABCD-EFGH-JKMN');
  });

  it('checks the code format before sending and can go back', async () => {
    enterLive();
    const login = vi.spyOn(api, 'login').mockRejectedValue(new ApiError(401, 'two-factor code required', 'totp_required'));
    open('login');
    type('Username', 'alice');
    type('Password', 'correct horse battery');
    fireEvent.submit(field('Password').form!);
    const code = await screen.findByLabelText('Authentication code');
    fireEvent.change(code, { target: { value: '123' } });
    fireEvent.submit(code.closest('form')!);
    expect(screen.getByRole('alert').textContent).toMatch(/6-digit code/);
    expect(login).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(field('Username').value).toBe('alice');
    expect(field('Password').value).toBe('');
  });

  it('maps live error codes to clear messages', async () => {
    enterLive();
    vi.spyOn(api, 'register').mockRejectedValue(new ApiError(403, 'guest accounts are disabled', 'guest_disabled'));
    open('register');
    type('Username', 'alice');
    type('Password', 'long enough password');
    fireEvent.submit(field('Password').form!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Guest accounts aren’t available with real funds/));
  });
});
