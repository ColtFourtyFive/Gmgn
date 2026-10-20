import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { WalletPeriodStats } from '@trenchscope/shared';
import { DistributionCard } from './WalletCards';

afterEach(cleanup);

describe('DistributionCard', () => {
  it('describes the buckets the server fills: total return (realized + unrealized), so an open loss sits in -50–0%', () => {
    // A wallet whose only token is an open position at -3.6% (what /wallets/:address returns for it).
    const stats = { distribution: { gt500: 0, p200to500: 0, p0to200: 0, n0to50: 1, lt50: 0 } } as WalletPeriodStats;
    render(<DistributionCard stats={stats} period="7d" />);
    const note = screen.getByText(/Tokens grouped by/);
    expect(note.textContent).toContain('total return (realized + unrealized)');
    expect(note.textContent).not.toMatch(/sit in 0–200% until sold/);
  });
});
