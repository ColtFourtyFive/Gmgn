// Live funding dialogs: Deposit (address, QR, copy, warnings, refresh) and
// Withdraw (disabled states, validation, Max with the fee reserve, exact
// payload, one idempotency key across retries, wrong 2FA code).

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account, DepositInfo, PortfolioSummary, SecurityStatus, TokenPositionRow, WalletTransfer } from '@trenchscope/shared';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { enterLive, leaveLive } from '@/testing/live';
import { DepositDialog } from './DepositDialog';
import { TransfersTable } from './TransfersTable';
import { WithdrawDialog } from './WithdrawDialog';

const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const LEDGER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const PENDING = 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH';
const MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const DAY = 86_400_000;

const initial = useSession.getState();
const depositInfo: DepositInfo = { chain: 'sol', address: WALLET, feeReserve: 0.01, commitment: 'confirmed' };

function security(over: Partial<SecurityStatus> = {}): SecurityStatus {
  return {
    twoFactorEnabled: true,
    whitelist: [{ chain: 'sol', address: LEDGER, label: 'Ledger', addedAt: Date.now() - 3 * DAY, activeAt: Date.now() - 2 * DAY }],
    whitelistDelayMs: DAY,
    recentEvents: [],
    ...over,
  };
}

const bonk = {
  chain: 'sol',
  token: MINT,
  wallet: WALLET,
  balance: 1234.567891,
  tokenInfo: { chain: 'sol', address: MINT, symbol: 'BONK', name: 'Bonk', logoSeed: 'bonk', logoGlyph: '🐶', imageUrl: null },
} as unknown as TokenPositionRow;

const transfer = (over: Partial<WalletTransfer> = {}): WalletTransfer => ({
  id: 't1',
  chain: 'sol',
  direction: 'withdrawal',
  mint: null,
  symbol: 'SOL',
  amount: 1.2,
  counterparty: LEDGER,
  signature: '5h6xBEauJ3PK6SWCZ1PGjBvj8vDdWG3KpwATGy1ARAXFSDwt8GFXM7W5Ncn16wmqokgpiKRLuS83KUxyZyv2sUYv',
  status: 'sent',
  networkFee: 0.000005,
  createdAt: Date.now(),
  confirmedAt: null,
  ...over,
});

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  enterLive();
  useSession.setState({
    token: 'tok',
    account: { id: 'a1', username: 'alice', wallets: { sol: { chain: 'sol', address: WALLET, nativeBalance: 1.5, nativeBalanceUsd: 270 } } } as unknown as Account,
  });
  vi.spyOn(api, 'depositInfo').mockResolvedValue(depositInfo);
  vi.spyOn(api, 'security').mockResolvedValue(security());
  vi.spyOn(api, 'portfolio').mockResolvedValue({ positions: [bonk] } as unknown as PortfolioSummary);
  vi.spyOn(api, 'me').mockResolvedValue(useSession.getState().account!);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  leaveLive();
  useSession.setState(initial, true);
});

function renderUi(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DepositDialog', () => {
  it('shows the address as text and QR code, what to send, the fee reserve and a Solscan link', async () => {
    renderUi(<DepositDialog open onClose={() => {}} />);
    expect((await screen.findByTestId('deposit-address')).textContent).toBe(WALLET);
    const qr = await screen.findByRole('img', { name: 'QR code of your Solana deposit address' });
    expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();
    expect(screen.getByText('Send only SOL or Solana SPL tokens to this address')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toMatch(/About 0\.01 SOL stays in the wallet for\s+network fees/);
    expect(screen.getByRole('link', { name: /View on Solscan/ }).getAttribute('href')).toBe(`https://solscan.io/account/${WALLET}`);
  });

  it('refreshes balances from the chain', async () => {
    const refresh = vi.spyOn(api, 'refreshWallet').mockResolvedValue({ chain: 'sol', address: WALLET, nativeBalance: 2.25, nativeBalanceUsd: 405 });
    renderUi(<DepositDialog open onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh balances' }));
    await waitFor(() => expect(useSession.getState().account?.wallets.sol.nativeBalance).toBe(2.25));
    expect(refresh).toHaveBeenCalledWith('sol');
  });

  it('explains a failure with Retry', async () => {
    vi.spyOn(api, 'depositInfo').mockRejectedValue(new ApiError(503, 'wallets are unavailable right now', 'wallets_unavailable'));
    renderUi(<DepositDialog open onClose={() => {}} />);
    // The address query retries once before giving up.
    expect((await screen.findByRole('alert', {}, { timeout: 4000 })).textContent).toMatch(/Wallets are temporarily unavailable/);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('WithdrawDialog disabled states', () => {
  it('without 2FA: explains, links to Security settings and keeps Withdraw disabled', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(security({ twoFactorEnabled: false }));
    renderUi(<WithdrawDialog open onClose={() => {}} />);
    expect(await screen.findByText('Turn on two-factor authentication to withdraw')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open Security settings/ }).getAttribute('href')).toBe('/settings?section=security');
    expect(screen.getByRole('button', { name: 'Withdraw' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByLabelText('Two-factor code')).toBeNull();
  });

  it('with only a pending address: shows when it activates', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(
      security({ whitelist: [{ chain: 'sol', address: PENDING, label: 'Exchange', addedAt: Date.now(), activeAt: Date.now() + 23 * 3_600_000 + 30 * 60_000 }] }),
    );
    renderUi(<WithdrawDialog open onClose={() => {}} />);
    expect(await screen.findByText('Your withdrawal address isn’t active yet')).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toMatch(/Exchange · HN7c\.\.\.YWrH can receive withdrawals in 23h (29|30)m/);
    expect(screen.getByRole('button', { name: 'Withdraw' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('with no address at all: asks to add one', async () => {
    vi.spyOn(api, 'security').mockResolvedValue(security({ whitelist: [] }));
    renderUi(<WithdrawDialog open onClose={() => {}} />);
    expect(await screen.findByText('Add a withdrawal address first')).toBeTruthy();
  });
});

async function openForm() {
  renderUi(<WithdrawDialog open onClose={() => {}} />);
  return (await screen.findByLabelText('Amount (SOL)')) as HTMLInputElement;
}

describe('WithdrawDialog form', () => {
  it('Max keeps the fee reserve; too much, no code and bad input are refused before sending', async () => {
    const withdraw = vi.spyOn(api, 'withdraw');
    const amount = await openForm();
    // The single active address is preselected.
    expect(screen.getByRole('button', { name: /To \(whitelisted address\) Ledger/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Available 1\.49 SOL/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw the maximum' }));
    expect(amount.value).toBe('1.49');

    fireEvent.change(amount, { target: { value: '1.495' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText(/More than you can withdraw: at most 1\.49 SOL \(0\.01 SOL stays for network fees\)/)).toBeTruthy();
    expect(screen.getByText('Enter the 6-digit code from your authenticator app')).toBeTruthy();
    expect(amount.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(amount, { target: { value: '1,5abc' } });
    expect(amount.value).toBe('1.5');
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('sends the exact request with an idempotency key that survives a lost answer', async () => {
    const withdraw = vi
      .spyOn(api, 'withdraw')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(transfer());
    const amount = await openForm();
    fireEvent.change(amount, { target: { value: '1.2' } });
    fireEvent.change(screen.getByLabelText('Two-factor code'), { target: { value: '123456' } });
    expect(screen.getByTestId('withdraw-summary').textContent).toMatch(/You send 1\.2 SOL to Ledger · 7xKX\.\.\.gAsU/);

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText('Withdrawal sent')).toBeTruthy();

    expect(withdraw).toHaveBeenCalledTimes(2);
    const [first, second] = withdraw.mock.calls.map((c) => c[0]);
    expect(first).toEqual({ chain: 'sol', to: LEDGER, mint: null, amount: 1.2, code: '123456', clientId: expect.any(String) });
    expect(second.clientId).toBe(first.clientId);
    const tx = screen.getByRole('link', { name: 'View transaction on Solscan' });
    expect(tx.getAttribute('href')).toBe(`https://solscan.io/tx/${transfer().signature}`);

    // The next withdrawal is a new request: a new key.
    fireEvent.click(screen.getByRole('button', { name: 'New withdrawal' }));
    withdraw.mockResolvedValueOnce(transfer({ id: 't2' }));
    fireEvent.change(screen.getByLabelText('Amount (SOL)'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Two-factor code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await screen.findByText('Withdrawal sent');
    expect(withdraw.mock.calls[2][0].clientId).not.toBe(first.clientId);
  });

  it('a wrong code clears the field without signing out', async () => {
    vi.spyOn(api, 'withdraw').mockRejectedValue(new ApiError(401, 'invalid two-factor code', 'totp_required'));
    const amount = await openForm();
    fireEvent.change(amount, { target: { value: '0.5' } });
    const code = screen.getByLabelText('Two-factor code') as HTMLInputElement;
    fireEvent.change(code, { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/That code didn’t work/);
    expect(code.value).toBe('');
    expect(useSession.getState().token).toBe('tok');
  });

  it('withdraws a held token: Max is the full token balance', async () => {
    const withdraw = vi.spyOn(api, 'withdraw').mockResolvedValue(transfer({ mint: MINT, symbol: 'BONK', amount: 1234.567891 }));
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: /^Asset/ }));
    fireEvent.click(await screen.findByRole('option', { name: /BONK/ }));
    const amount = screen.getByLabelText('Amount (BONK)') as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw the maximum' }));
    expect(amount.value).toBe('1234.567891');
    fireEvent.change(screen.getByLabelText('Two-factor code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    await screen.findByText('Withdrawal sent');
    expect(withdraw.mock.calls[0][0]).toMatchObject({ mint: MINT, amount: 1234.567891 });
  });
});

describe('TransfersTable', () => {
  it('lists deposits and withdrawals with status and Solscan links', () => {
    renderUi(
      <TransfersTable
        loading={false}
        rows={[
          transfer({ id: 'd1', direction: 'deposit', amount: 2, counterparty: PENDING, status: 'confirmed' }),
          transfer({ id: 'w1', status: 'failed', error: 'blockhash expired', signature: null }),
        ]}
      />,
    );
    const table = screen.getByRole('table', { name: 'Deposits and withdrawals' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1].textContent).toMatch(/Deposit\+2 SOL/);
    expect(within(rows[1]).getByText('Confirmed')).toBeTruthy();
    expect(within(rows[1]).getByRole('link', { name: 'View transaction on Solscan' })).toBeTruthy();
    expect(within(rows[2]).getByLabelText('Failed: blockhash expired')).toBeTruthy();
  });
});
