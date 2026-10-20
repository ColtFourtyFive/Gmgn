// The Settings page renders its tabs from the section registry: the same
// sections in the same order as before, Security only in live mode.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Account, MetaResponse, UserSettings } from '@trenchscope/shared';
import { DEFAULT_DISPLAY, DEFAULT_TRADE } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import SettingsPage from '@/pages/SettingsPage';
import { useSession } from '@/store/session';
import { enterLive, leaveLive } from '@/testing/live';
import { SETTINGS_SECTIONS, visibleSettingsSections } from './registry';

const initial = useSession.getState();
const account = { id: 'a1', username: 'guest-1', isGuest: true, wallets: {}, createdAt: 1, referralCode: 'CODE' } as unknown as Account;

beforeEach(() => {
  vi.spyOn(api, 'meta').mockReturnValue(new Promise<MetaResponse>(() => {}));
  const settings: UserSettings = { trade: DEFAULT_TRADE, display: DEFAULT_DISPLAY };
  useSession.setState({ token: 'tok', account, settings, ready: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  leaveLive();
  useSession.setState(initial, true);
});

function renderAt(url: string) {
  const router = createMemoryRouter([{ path: '/settings', element: <SettingsPage /> }], { initialEntries: [url] });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const tabs = within(screen.getByRole('tablist', { name: 'Settings sections' })).getAllByRole('tab');
  return { names: tabs.map((t) => t.textContent), selected: tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.textContent };
}

describe('settings section registry', () => {
  it('lists the sections in tab order, Security only in live', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual(['trading', 'display', 'blacklist', 'account', 'security']);
    expect(visibleSettingsSections('demo', account).map((s) => s.id)).toEqual(['trading', 'display', 'blacklist', 'account']);
    expect(visibleSettingsSections('live', account).map((s) => s.id)).toEqual(['trading', 'display', 'blacklist', 'account', 'security']);
  });

  it('demo: four tabs, Trading by default, and ?section=security falls back to Trading', () => {
    expect(renderAt('/settings')).toEqual({ names: ['Trading', 'Display', 'Blacklist', 'Account'], selected: 'Trading' });
    cleanup();
    expect(renderAt('/settings?section=security').selected).toBe('Trading');
    cleanup();
    expect(renderAt('/settings?section=blacklist').selected).toBe('Blacklist');
  });

  it('live: Security is the fifth tab and opens from ?section=security', () => {
    enterLive();
    expect(renderAt('/settings?section=security')).toEqual({ names: ['Trading', 'Display', 'Blacklist', 'Account', 'Security'], selected: 'Security' });
  });
});
