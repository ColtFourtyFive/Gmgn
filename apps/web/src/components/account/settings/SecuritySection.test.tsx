// Settings → Security (live): 2FA enrolment (QR + manual key, confirm,
// recovery codes shown once behind "I saved them"), turning 2FA off, the
// withdrawal whitelist (add / pending countdown / remove) and recent events.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account, SecurityStatus } from '@trenchscope/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { enterLive, leaveLive } from '@/testing/live';
import { eventLabel, groupSecret, SecuritySection, validateWhitelistAdd } from './SecuritySection';

const LEDGER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const NEW_ADDR = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const DAY = 86_400_000;
const initial = useSession.getState();

function status(over: Partial<SecurityStatus> = {}): SecurityStatus {
  return { twoFactorEnabled: false, whitelist: [], whitelistDelayMs: DAY, recentEvents: [], ...over };
}

beforeEach(() => {
  enterLive();
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'alice', wallets: {} } as unknown as Account });
  vi.spyOn(api, 'me').mockResolvedValue(useSession.getState().account!);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  leaveLive();
  useSession.setState(initial, true);
});

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SecuritySection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('two-factor enrolment', () => {
  it('QR + manual key, confirm with a code, then recovery codes that must be saved', async () => {
    const security = vi.spyOn(api, 'security').mockResolvedValue(status());
    vi.spyOn(api, 'setupTotp').mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/Trenchscope:alice?secret=JBSWY3DPEHPK3PXP&issuer=Trenchscope' });
    const enable = vi.spyOn(api, 'enableTotp').mockResolvedValue({ enabled: true, recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'] });
    renderSection();

    fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor authentication' }));
    expect((await screen.findByRole('img', { name: 'QR code for your authenticator app' })).getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByTestId('totp-secret').textContent).toBe('JBSW Y3DP EHPK 3PXP');
    expect(screen.getByRole('button', { name: 'Copy setup key' })).toBeTruthy();

    // A short code is refused before it is sent.
    fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(screen.getByText('Enter the 6-digit code from your authenticator app')).toBeTruthy();
    expect(enable).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Code from the app'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save your recovery codes' });
    expect(enable).toHaveBeenCalledWith('123456');
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['aaaa-bbbb', 'cccc-dddd']);
    expect(within(dialog).getByRole('button', { name: 'Copy codes' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Download' })).toBeTruthy();

    // Not dismissible until the codes are saved.
    const done = within(dialog).getByRole('button', { name: 'Done' });
    expect(done.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Save your recovery codes' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I saved my recovery codes' }));
    security.mockResolvedValue(status({ twoFactorEnabled: true }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy());
  });

  it('shows a refused code as an error', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status());
    vi.spyOn(api, 'setupTotp').mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' });
    vi.spyOn(api, 'enableTotp').mockRejectedValue(new ApiError(401, 'invalid two-factor code', 'totp_required'));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Set up two-factor authentication' }));
    fireEvent.change(await screen.findByLabelText('Code from the app'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/That code didn’t work/);
    expect(useSession.getState().token).toBe('tok');
  });

  it('turns 2FA off with a code or a recovery code, then signs in again (the server ends every session)', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status({ twoFactorEnabled: true }));
    const disable = vi.spyOn(api, 'disableTotp').mockResolvedValue({ enabled: false });
    const logout = vi.spyOn(api, 'logout').mockResolvedValue({ ok: true });
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    const field = screen.getByLabelText('Code from your app (or a recovery code)');
    fireEvent.change(field, { target: { value: 'abcd-efgh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off two-factor' }));
    expect(screen.getByText('Enter the 6-digit code or a recovery code')).toBeTruthy();
    expect(disable).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'abcd-efgh-jkmn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off two-factor' }));
    await waitFor(() => expect(disable).toHaveBeenCalledWith('abcd-efgh-jkmn'));
    await waitFor(() => expect(useSession.getState().token).toBeNull());
    expect(logout).toHaveBeenCalled();
    expect(useSession.getState()).toMatchObject({ authPrompt: true, authTab: 'login' });
  });
});

describe('withdrawal whitelist', () => {
  const active = { chain: 'sol' as const, address: LEDGER, label: 'Ledger', addedAt: Date.now() - 2 * DAY, activeAt: Date.now() - DAY };
  const pending = { chain: 'sol' as const, address: NEW_ADDR, label: 'Exchange', addedAt: Date.now(), activeAt: Date.now() + 5 * 3_600_000 + 60_000 };

  it('needs 2FA to change addresses', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status({ whitelist: [active] }));
    renderSection();
    expect(await screen.findByText('Turn on two-factor authentication to add or remove withdrawal addresses.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add address' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove Ledger/ })).toBeNull();
  });

  it('shows active and pending addresses with a countdown', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status({ twoFactorEnabled: true, whitelist: [active, pending] }));
    renderSection();
    const list = await screen.findByRole('list', { name: 'Whitelisted addresses' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(within(first).getByText('Exchange')).toBeTruthy();
    expect(first.textContent).toMatch(/Activates in 5h 0[01]m/);
    expect(within(second).getByText('Active')).toBeTruthy();
    expect(within(second).getByRole('link', { name: 'View wallet on Solscan' }).getAttribute('href')).toBe(`https://solscan.io/account/${LEDGER}`);
  });

  it('adds an address with a name and code (validated first)', async () => {
    const security = vi.spyOn(api, 'security').mockResolvedValue(status({ twoFactorEnabled: true, whitelist: [active] }));
    const add = vi.spyOn(api, 'addWhitelist').mockResolvedValue(pending);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Add address' }));
    const form = screen.getByRole('form', { name: 'Add a withdrawal address' });
    fireEvent.change(within(form).getByLabelText('Solana address'), { target: { value: LEDGER } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add address' }));
    expect(within(form).getByText('Name it, e.g. “Ledger” or “Exchange”')).toBeTruthy();
    expect(within(form).getByText('This address is already on the list')).toBeTruthy();
    expect(add).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText('Name'), { target: { value: ' Exchange ' } });
    fireEvent.change(within(form).getByLabelText('Solana address'), { target: { value: ` ${NEW_ADDR} ` } });
    fireEvent.change(within(form).getByLabelText('Two-factor code'), { target: { value: '123456' } });
    security.mockResolvedValue(status({ twoFactorEnabled: true, whitelist: [active, pending] }));
    fireEvent.click(within(form).getByRole('button', { name: 'Add address' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith({ chain: 'sol', address: NEW_ADDR, label: 'Exchange', code: '123456' }));
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Add a withdrawal address' })).toBeNull());
    expect(await screen.findByText(/Activates in/)).toBeTruthy();
  });

  it('removes an address with a code', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status({ twoFactorEnabled: true, whitelist: [active] }));
    const remove = vi.spyOn(api, 'removeWhitelist').mockResolvedValue({ ok: true });
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Ledger' }));
    fireEvent.change(screen.getByLabelText('Two-factor code'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByRole('alert').textContent).toMatch(/6-digit code/);
    fireEvent.change(screen.getByLabelText('Two-factor code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ chain: 'sol', address: LEDGER, code: '123456' }));
  });
});

describe('password', () => {
  it('changes it with the 2FA code and continues on the new session', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status({ twoFactorEnabled: true }));
    vi.spyOn(api, 'settings').mockResolvedValue({ trade: {}, display: { theme: 'dark' } } as never);
    const change = vi.spyOn(api, 'changePassword').mockResolvedValue({ token: 'fresh', account: useSession.getState().account! });
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const form = screen.getByRole('form', { name: 'Change password' });
    fireEvent.change(within(form).getByLabelText('Current password'), { target: { value: 'old password 1' } });
    fireEvent.change(within(form).getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(within(form).getByLabelText('Repeat the new password'), { target: { value: 'other' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect(within(form).getByText('Use at least 10 characters')).toBeTruthy();
    expect(within(form).getByText('The passwords don’t match')).toBeTruthy();
    expect(within(form).getByText('Enter the 6-digit code from your authenticator app')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText('New password'), { target: { value: 'a much longer one' } });
    fireEvent.change(within(form).getByLabelText('Repeat the new password'), { target: { value: 'a much longer one' } });
    fireEvent.change(within(form).getByLabelText('Two-factor code'), { target: { value: '123456' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ currentPassword: 'old password 1', newPassword: 'a much longer one', code: '123456' }));
    await waitFor(() => expect(useSession.getState().token).toBe('fresh'));
  });

  it('shows a wrong current password', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(status());
    vi.spyOn(api, 'changePassword').mockRejectedValue(new ApiError(401, 'current password is incorrect', 'invalid_credentials'));
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    const form = screen.getByRole('form', { name: 'Change password' });
    expect(within(form).queryByLabelText('Two-factor code')).toBeNull();
    fireEvent.change(within(form).getByLabelText('Current password'), { target: { value: 'wrong one' } });
    fireEvent.change(within(form).getByLabelText('New password'), { target: { value: 'a much longer one' } });
    fireEvent.change(within(form).getByLabelText('Repeat the new password'), { target: { value: 'a much longer one' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Change password' }));
    expect((await screen.findByRole('alert')).textContent).toBe('current password is incorrect');
    expect(useSession.getState().token).toBe('tok');
  });
});

describe('recent security events', () => {
  it('lists events with readable names, IP and age', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(
      status({
        recentEvents: [
          { at: Date.now() - 60_000, action: 'login_failed', ip: '203.0.113.9', detail: 'wrong password' },
          { at: Date.now() - 120_000, action: 'whitelist_add', ip: null, detail: 'Ledger' },
        ],
      }),
    );
    renderSection();
    const list = await screen.findByRole('list', { name: 'Security events' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/Failed sign-in.*wrong password.*203\.0\.113\.9.*1m ago/);
    expect(items[1].textContent).toMatch(/Withdrawal address added/);
  });

  it('names unknown actions sensibly', () => {
    expect(eventLabel('2fa_enabled')).toBe('Two-factor turned on');
    expect(eventLabel('api_key_created')).toBe('Api key created');
    expect(groupSecret('ABCDEFGHIJ')).toBe('ABCD EFGH IJ');
    expect(validateWhitelistAdd({ label: 'x', address: '0xabc', code: '1' }, [])).toMatchObject({ address: 'That isn’t a Solana address', code: expect.any(String) });
  });
});
