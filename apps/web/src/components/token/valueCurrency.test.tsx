import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { STAT_WINDOWS, type TokenDetail, type UserSettings, type WindowStats } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { useSession } from '@/store/session';
import { useValueCurrency } from './queries';
import { StatsStrip } from './StatsStrip';
import { useTokenUi } from './store';

const initial = useSession.getState();
const settings = (currency: 'usd' | 'native'): UserSettings => ({ trade: DEFAULT_TRADE, display: { ...DEFAULT_DISPLAY, currency } });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  useSession.setState(initial, true);
  useTokenUi.setState({ currencyOverride: null });
});

const win: WindowStats = { volumeUsd: 20_000, buyVolumeUsd: 12_000, sellVolumeUsd: 8_000, swaps: 10, buys: 6, sells: 4, priceChange: 0.1, makers: 5 };
const token = {
  chain: 'sol',
  priceUsd: 0.0002,
  priceNative: 0.000001,
  nativeUsd: 200,
  marketCapUsd: 200_000,
  athMarketCapUsd: 400_000,
  liquidityUsd: 50_000,
  holderCount: 100,
  smartDegenCount: 1,
  kolCount: 0,
  pool: null,
  stats: Object.fromEntries(STAT_WINDOWS.map((w) => [w, win])),
} as unknown as TokenDetail;

describe('token page currency (settings.display.currency)', () => {
  it('follows the saved setting and saves changes made on the page', async () => {
    useSession.setState({ token: 'tok', settings: settings('native') });
    const save = vi.fn(async (patch: { display?: { currency?: string } }) => {
      useSession.setState({ settings: settings(patch.display!.currency as 'usd' | 'native') });
    });
    useSession.setState({ saveSettings: save });
    const { result } = renderHook(() => useValueCurrency());
    expect(result.current[0]).toBe('native');

    await act(async () => result.current[1]('usd'));
    expect(save).toHaveBeenCalledWith({ display: { currency: 'usd' } });
    expect(result.current[0]).toBe('usd');
    expect(useTokenUi.getState().currencyOverride).toBeNull();

    // A later change in Settings applies (no stale page override).
    act(() => useSession.setState({ settings: settings('native') }));
    expect(result.current[0]).toBe('native');
  });

  it('shows market stats in the native token when chosen', () => {
    useSession.setState({ token: 'tok', settings: settings('native') });
    render(<StatsStrip token={token} />);
    const stats = screen.getByRole('region', { name: 'Market stats' });
    expect(within(stats).getByText('1K SOL')).toBeTruthy(); // market cap 200K USD at 200 USD/SOL
    expect(within(stats).getByText('250 SOL')).toBeTruthy(); // liquidity
    expect(stats.textContent).not.toContain('$200K');
  });

  it('shows USD by default', () => {
    render(<StatsStrip token={token} />);
    expect(screen.getByRole('region', { name: 'Market stats' }).textContent).toContain('$200K');
  });
});
