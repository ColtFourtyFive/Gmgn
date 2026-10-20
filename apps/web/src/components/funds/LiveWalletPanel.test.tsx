// Live wallet entry points: the portfolio wallet panel (balance, transfers,
// Deposit / Withdraw / Refresh), the header balance pill (no faucet in live)
// and the signed-out gate copy.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { Account, SecurityStatus, WalletTransfer } from '@trenchscope/shared';
import { AccountGate } from '@/components/account/AccountGate';
import { BalancePill } from '@/components/layout/AccountControls';
import { api } from '@/lib/api';
import { useFunds } from '@/store/funds';
import { useSession } from '@/store/session';
import { enterLive, leaveLive } from '@/testing/live';
import { FundsDialogs } from './FundsDialogs';
import { LiveWalletPanel } from './LiveWalletPanel';

const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const initial = useSession.getState();

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});
beforeEach(() => {
  useSession.setState({
    token: 'tok',
    account: { id: 'a1', username: 'alice', wallets: { sol: { chain: 'sol', address: WALLET, nativeBalance: 1.5, nativeBalanceUsd: 270 } } } as unknown as Account,
  });
  vi.spyOn(api, 'depositInfo').mockResolvedValue({ chain: 'sol', address: WALLET, feeReserve: 0.01, commitment: 'confirmed' });
  vi.spyOn(api, 'security').mockResolvedValue({ twoFactorEnabled: false, whitelist: [], whitelistDelayMs: 86_400_000, recentEvents: [] } as SecurityStatus);
  vi.spyOn(api, 'transfers').mockResolvedValue([
    { id: 'd1', chain: 'sol', direction: 'deposit', mint: null, symbol: 'SOL', amount: 2, counterparty: null, signature: 'sig1', status: 'confirmed', networkFee: 0, createdAt: Date.now(), confirmedAt: Date.now() },
  ] as WalletTransfer[]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  leaveLive();
  useSession.setState(initial, true);
  useFunds.setState({ open: null, mint: null });
});

function renderUi(ui: React.ReactNode) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        {ui}
        <FundsDialogs />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LiveWalletPanel', () => {
  it('shows the wallet, its transfers and opens Deposit / Withdraw', async () => {
    enterLive();
    renderUi(<LiveWalletPanel />);
    expect(screen.getByRole('link', { name: 'View wallet on Solscan' }).getAttribute('href')).toBe(`https://solscan.io/account/${WALLET}`);
    expect(await screen.findByText('Confirmed')).toBeTruthy();
    expect(api.transfers).toHaveBeenCalledWith(50);

    fireEvent.click(screen.getByRole('button', { name: 'Deposit' }));
    expect(await screen.findByRole('dialog', { name: 'Deposit' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByRole('dialog', { name: 'Withdraw' })).toBeTruthy();
    expect(await screen.findByText('Turn on two-factor authentication to withdraw')).toBeTruthy();
  });
});

describe('BalancePill', () => {
  it('demo Deposit uses the paper faucet', async () => {
    const faucet = vi.spyOn(api, 'faucet').mockResolvedValue({ chain: 'sol', address: WALLET, nativeBalance: 50, nativeBalanceUsd: 9000 });
    renderUi(<BalancePill chain="sol" />);
    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    await waitFor(() => expect(faucet).toHaveBeenCalledWith('sol'));
  });

  it('live Deposit opens the deposit address, never the faucet', async () => {
    enterLive();
    const faucet = vi.spyOn(api, 'faucet');
    renderUi(<BalancePill chain="sol" />);
    expect(screen.getByTitle('Wallet balance')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Deposit/ }));
    expect(await screen.findByRole('dialog', { name: 'Deposit' })).toBeTruthy();
    expect(faucet).not.toHaveBeenCalled();
  });
});

describe('AccountGate', () => {
  it('live asks to create an account instead of a paper quick start', () => {
    useSession.setState(initial, true);
    useSession.setState({ ready: true });
    enterLive();
    renderUi(
      <AccountGate icon={<Star />} title="Track your portfolio" description="Sign in.">
        <p>rows</p>
      </AccountGate>,
    );
    expect(screen.queryByRole('button', { name: 'Start paper trading' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(useSession.getState()).toMatchObject({ authPrompt: true, authTab: 'register' });
    expect(document.body.textContent).not.toMatch(/paper|simulated/i);
  });
});
