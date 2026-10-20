import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useDock } from '@/store/dock';
import { InstantDock } from './InstantDock';

vi.mock('@/components/trade/InstantTrade', () => ({
  InstantTradeTab: () => <button type="button">Buy</button>,
  DockPositions: () => <p>Positions</p>,
}));

// A desktop viewport: min-width queries match, max-width ones do not.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  localStorage.clear();
  useDock.setState({ open: false, collapsed: false, tab: 'trade', focusRequested: false });
});

function setup() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <button type="button" data-dock-toggle onClick={() => useDock.getState().toggle()}>
          Toggle dock
        </button>
        <InstantDock />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('button', { name: 'Toggle dock' });
}

describe('Instant trade dock keyboard support', () => {
  it('takes focus when the user opens it and gives it back on close', () => {
    const toggle = setup();
    act(() => toggle.focus());
    act(() => useDock.getState().toggle());
    const tab = screen.getByRole('tab', { name: /Instant trade/ });
    expect(document.activeElement).toBe(tab);

    act(() => useDock.getState().toggle()); // "i" or the close button
    expect(screen.queryByRole('region', { name: 'Instant trade dock' })).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('leaves focus alone when the panel is restored open on page load', () => {
    useDock.setState({ open: true });
    const toggle = setup();
    expect(screen.getByRole('region', { name: 'Instant trade dock' })).toBeTruthy();
    expect(document.activeElement).not.toBe(screen.getByRole('tab', { name: /Instant trade/ }));
    expect(toggle).toBeTruthy();
  });
});
