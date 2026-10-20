import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { WalletRiskFlag, WalletRiskReport } from '@trenchscope/shared';
import { RiskCardView } from './RiskCard';

afterEach(cleanup);

const flag = (over: Partial<WalletRiskFlag>): WalletRiskFlag => ({
  key: 'wash',
  label: 'Wash-trading pattern',
  level: 'ok',
  value: 'None',
  count: 0,
  rate: null,
  definition: 'Wash-trading pattern: tokens it bought and sold back within 60s at least twice.',
  ...over,
});

const LOOKALIKE = 'AbCdQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQwxyz';
const FUNDER = 'FundQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQerrr';

const report: WalletRiskReport = {
  chain: 'sol',
  address: 'W',
  level: 'high',
  updatedAt: 0,
  flags: [
    flag({ key: 'phishing', label: 'Address poisoning', level: 'bad', value: '6 dust transfers from 2 look-alikes', count: 6, definition: 'Address poisoning: dust from addresses that copy a partner.', addresses: [LOOKALIKE] }),
    flag({}),
    flag({ key: 'flagged_funder', label: 'Funded by a flagged dev', level: 'warn', value: 'Funder rugged 1 of 3', count: 1, addresses: [FUNDER] }),
    flag({ key: 'honeypot', label: 'Honeypot tokens traded', level: 'unknown', value: 'No tokens traded' }),
  ],
};

function show(r: WalletRiskReport | undefined, error: unknown = null) {
  const retry = vi.fn();
  render(
    <MemoryRouter>
      <RiskCardView chain="sol" report={r} loading={!r} error={error} onRetry={retry} />
    </MemoryRouter>,
  );
  return retry;
}

describe('RiskCard', () => {
  it('lists every flag with its level, value and overall verdict', () => {
    show(report);
    expect(screen.getByText('Red flags')).toBeTruthy();
    expect(screen.getByText('2 of 4 checks flagged')).toBeTruthy();
    const items = within(screen.getByRole('list', { name: 'Risk flags' })).getAllByRole('listitem');
    expect(items.map((li) => li.textContent?.split(':')[0])).toEqual(['Red flag', 'OK', 'Caution', 'Unknown']);
    expect(items[0].textContent).toContain('6 dust transfers from 2 look-alikes');
  });

  it('never offers a look-alike address to copy or follow, but links the flagged funder', () => {
    show(report);
    expect(screen.queryByRole('button', { name: /copy/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /AbCdQQ/ })).toBeNull();
    expect(screen.getByText('AbCdQQ...QQwxyz')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fund...errr' }).getAttribute('href')).toBe(`/sol/address/${FUNDER}`);
  });

  it('explains each flag on focus (tooltip) and to screen readers in reading order', async () => {
    vi.useFakeTimers();
    try {
      show(report);
      const info = screen.getByRole('button', { name: 'What “Address poisoning” means' });
      await act(async () => {
        fireEvent.focus(info);
        vi.advanceTimersByTime(400);
      });
      expect(screen.getByRole('tooltip').textContent).toBe('Address poisoning: dust from addresses that copy a partner.');
      expect(info.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a retryable error', () => {
    const retry = show(undefined, new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalled();
  });
});
