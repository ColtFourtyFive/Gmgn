// Mode gating: live serves Solana only (routes, switchers, palette), hides the
// token launcher, and shows its identity (Live badge, live status, Try demo,
// trading-unavailable banner); demo keeps its look plus the Demo label.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ChainGuard, DemoOnly } from '@/App';
import { applyMeta, flagTradingUnavailable } from '@/lib/mode';
import { useUi } from '@/store/ui';
import { DEMO_URL, enterLive, leaveLive } from '@/testing/live';
import { ChainPicker, ChainSwitcher } from './ChainSwitcher';
import { CommandPalette } from './CommandPalette';
import { MainNav } from './MainNav';
import { DEMO_LABEL, LiveStatusIndicator, ModeBadge, TradingUnavailableBanner, TryDemoLink } from './ModeIndicators';
import { NAV_ITEMS, navItemsFor } from './nav';

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  leaveLive();
  useUi.setState({ paletteOpen: false, chain: 'sol' });
});

function At() {
  return <p data-testid="at">{useLocation().pathname}</p>;
}

function guarded(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/:chain/:section"
          element={
            <ChainGuard>
              <p>page</p>
            </ChainGuard>
          }
        />
        <Route
          path="/:chain/launch"
          element={
            <ChainGuard>
              <DemoOnly>
                <p>launcher</p>
              </DemoOnly>
            </ChainGuard>
          }
        />
      </Routes>
      <At />
    </MemoryRouter>,
  );
  return screen.getByTestId('at').textContent;
}

describe('chain routes', () => {
  it('demo serves every chain', () => {
    expect(guarded('/bsc/trending')).toBe('/bsc/trending');
  });

  it('live sends other chains to the same section on Solana, unknown chains to Solana trenches', () => {
    enterLive();
    expect(guarded('/bsc/trending')).toBe('/sol/trending');
    cleanup();
    expect(guarded('/doge/trending')).toBe('/sol/trenches');
  });

  it('the token launcher is demo-only', () => {
    expect(guarded('/sol/launch')).toBe('/sol/launch');
    expect(screen.getByText('launcher')).toBeTruthy();
    cleanup();
    enterLive();
    expect(guarded('/sol/launch')).toBe('/sol/trenches');
    expect(screen.queryByText('launcher')).toBeNull();
  });
});

describe('navigation and switchers', () => {
  it('live nav has no Launch entry', () => {
    expect(navItemsFor('demo')).toBe(NAV_ITEMS);
    expect(navItemsFor('live').map((n) => n.key)).not.toContain('launch');
    enterLive();
    render(
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <MainNav chain="sol" />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Launch')).toBeNull();
    expect(screen.getAllByText('Trenches').length).toBeGreaterThan(0);
  });

  it('live shows the single chain instead of a switcher, and no chain picker', () => {
    enterLive();
    render(
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <ChainSwitcher />
        <ChainPicker />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.getByText('SOL')).toBeTruthy();
  });

  it('a remembered chain the deployment does not serve falls back on global routes', () => {
    useUi.setState({ chain: 'bsc' });
    enterLive();
    render(
      <MemoryRouter initialEntries={['/portfolio']}>
        <ChainSwitcher />
      </MemoryRouter>,
    );
    expect(screen.getByTitle('Chain: Solana')).toBeTruthy();
  });
});

function openPalette() {
  useUi.setState({ paletteOpen: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/sol/trenches']}>
        <CommandPalette />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('listbox', { name: 'Results' });
}

describe('command palette', () => {
  it('demo offers other chains', () => {
    const list = openPalette();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'switch to' } });
    expect(within(list).getByRole('option', { name: /Switch to Ethereum/ })).toBeTruthy();
  });

  it('live offers only Solana, no launcher, and the funding / security actions', () => {
    enterLive();
    const list = openPalette();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'switch to' } });
    expect(within(list).queryByRole('option', { name: /Switch to (Base|Ethereum)|BNB/ })).toBeNull();
    fireEvent.change(input, { target: { value: 'trending bnb' } });
    expect(within(list).queryByRole('option', { name: /BNB Chain/ })).toBeNull();
    fireEvent.change(input, { target: { value: 'launch' } });
    expect(within(list).queryByRole('option', { name: /^Launch/ })).toBeNull();
    fireEvent.change(input, { target: { value: 'withdraw' } });
    expect(within(list).getByRole('option', { name: /Withdraw/ })).toBeTruthy();
    fireEvent.change(input, { target: { value: '2fa' } });
    expect(within(list).getByRole('option', { name: /Security settings/ })).toBeTruthy();
  });
});

describe('mode identity', () => {
  it('demo: a Demo label naming the simulated market and paper balances, once the server confirmed the mode', () => {
    const { container } = render(<ModeBadge />);
    expect(container.innerHTML).toBe('');
    act(() => applyMeta({ mode: 'demo', enabledChains: ['sol', 'bsc', 'base', 'eth'], live: undefined, demoUrl: null, platformFeeRate: 0.008 }));
    const badge = screen.getByText('Demo');
    expect(badge.getAttribute('title')).toBe(DEMO_LABEL);
    expect(badge.textContent).toBe('Demo · simulated market, paper balances');
  });

  it('live: a Live badge with the stack status', () => {
    enterLive();
    render(<ModeBadge />);
    const badge = screen.getByText('Live');
    expect(badge.getAttribute('data-mode')).toBe('live');
    expect(badge.textContent).toMatch(/real funds on Solana · Feed connected/);
  });

  it('live status: connected, delayed with the last event age, trading unavailable', () => {
    enterLive({ lastEventAt: Date.now() - 3_000 });
    const { unmount } = render(<LiveStatusIndicator />);
    expect(screen.getByTestId('live-status').textContent).toMatch(/Feed connected · last event \ds ago · 1,234 tokens tracked/);
    unmount();

    enterLive({ lastEventAt: Date.now() - 125_000 });
    render(<LiveStatusIndicator />);
    expect(screen.getByTestId('live-status').textContent).toMatch(/Feed delayed · last event 2m ago/);
    cleanup();

    enterLive({ tradingEnabled: false });
    render(<LiveStatusIndicator />);
    expect(screen.getByTestId('live-status').getAttribute('data-health')).toBe('trading_unavailable');
    expect(screen.getByTestId('live-status').textContent).toMatch(/Trading unavailable/);
  });

  it('Try demo links to the demo deployment when configured', () => {
    render(<TryDemoLink />);
    expect(screen.queryByRole('link')).toBeNull(); // demo itself
    cleanup();
    enterLive();
    render(<TryDemoLink />);
    const link = screen.getByRole('link', { name: /Try demo/ });
    expect(link.getAttribute('href')).toBe(DEMO_URL);
    expect(link.getAttribute('rel')).toContain('noopener');
    cleanup();
    enterLive({}, { demoUrl: null });
    render(<TryDemoLink />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('the trading-unavailable banner shows in live only, from the status or a refused trade', () => {
    render(<TradingUnavailableBanner />);
    expect(screen.queryByTestId('trading-unavailable')).toBeNull();
    cleanup();

    enterLive({ tradingEnabled: false });
    render(<TradingUnavailableBanner />);
    expect(screen.getByTestId('trading-unavailable').textContent).toMatch(/Trading is temporarily unavailable/);
    cleanup();

    enterLive();
    render(<TradingUnavailableBanner />);
    expect(screen.queryByTestId('trading-unavailable')).toBeNull();
    act(() => flagTradingUnavailable(Date.now() + 1));
    expect(screen.getByTestId('trading-unavailable')).toBeTruthy();
  });
});
