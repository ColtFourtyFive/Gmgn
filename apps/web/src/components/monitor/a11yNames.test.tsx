import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { LeaderboardRow } from '@trenchscope/shared';
import { DistBar } from '@/pages/LeaderboardPage';
import { WalletStack } from './HotBySmartMoney';

afterEach(cleanup);

describe('focusable data graphics', () => {
  it('the PnL distribution bar is an image named with its bucket counts', () => {
    const row = { stats: { distribution: { gt500: 1, p200to500: 2, p0to200: 3, n0to50: 4, lt50: 5 } } } as unknown as LeaderboardRow;
    render(<DistBar row={row} />);
    const img = screen.getByRole('img', { name: /^PnL distribution: >500% 1, 200–500% 2, 0–200% 3, -50–0% 4, <-50% 5$/ });
    expect(img.tabIndex).toBe(0);
  });

  it('the smart wallet stack is an image naming the wallets', () => {
    render(<WalletStack wallets={['7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', 'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ']} />);
    expect(screen.getByRole('img', { name: /^2 smart wallets: 7xKX.*, GThU.*$/ })).toBeTruthy();
  });
});
