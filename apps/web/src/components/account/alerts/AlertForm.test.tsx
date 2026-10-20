// Alert rule drawer: signal subscriptions (from the Signals page's Subscribe)
// and holding alerts send their own rule shapes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Account, AlertRule } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { AlertForm, type AlertPrefill } from './AlertForm';

const initial = useSession.getState();

beforeEach(() => {
  useSession.setState({ token: 'tok', account: { id: 'a1', username: 'g', isGuest: true, wallets: {} } as unknown as Account, ready: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSession.setState({ ...initial, token: null, account: null, settings: null });
});

function open(prefill: AlertPrefill, rule: AlertRule | null = null) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AlertForm open onClose={onClose} rule={rule} chain="sol" prefill={prefill} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onClose;
}

describe('AlertForm: holding alerts', () => {
  it('creates a holding rule over every held token with the picked triggers', async () => {
    const create = vi.spyOn(api, 'createAlert').mockImplementation(async (body) => ({ ...body, id: 'r1', createdAt: 0, lastTriggeredAt: null }) as AlertRule);
    open({ kind: 'holding', chain: 'sol', repeat: true });
    // defaults: +-20% vs cost and dev sells
    fireEvent.change(screen.getByRole('textbox', { name: 'Up at least (%)' }), { target: { value: '50' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Liquidity drops (%)' }), { target: { value: '40' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Cooldown (minutes)' }), { target: { value: '15' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create alert' })));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      kind: 'holding',
      token: null,
      signals: null,
      holding: { basis: 'vs_cost', upPct: 50, downPct: 20, devSell: true, liquidityDropPct: 40, minPositionUsd: 10, cooldownMin: 15 },
    });
  });

  it('needs at least one trigger', async () => {
    const create = vi.spyOn(api, 'createAlert');
    open({ kind: 'holding', chain: 'sol', holdUpPct: null, holdDownPct: null, holdDevSell: false });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create alert' })));
    expect(screen.getByText('Turn on at least one trigger.')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('AlertForm: signal subscriptions', () => {
  it('creates a subscription with the picked kinds and filters', async () => {
    const create = vi.spyOn(api, 'createAlert').mockImplementation(async (body) => ({ ...body, id: 'r1', createdAt: 0, lastTriggeredAt: null }) as AlertRule);
    const onClose = open({ kind: 'signal_subscription', chain: 'sol', signalKinds: ['smart_buy'], excludeRisk: true, repeat: true });
    expect((screen.getByRole('checkbox', { name: 'Smart buy' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'KOL buy' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name (optional)' }), { target: { value: 'Smart entries' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Min liquidity (USD)' }), { target: { value: '10000' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Max top-10 share' }), { target: { value: '30' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create alert' })));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0]).toMatchObject({
      chain: 'sol',
      kind: 'signal_subscription',
      token: null,
      repeat: true,
      signals: {
        name: 'Smart entries',
        maxPerHour: 30,
        groups: [{ kinds: ['smart_buy', 'kol_buy'], minLiquidityUsd: 10_000, maxTop10: 0.3, mcMin: null, mcMax: null, excludeRisk: true }],
      },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the other groups of a subscription it edits, and checks bounds', async () => {
    const rule = {
      id: 'r1',
      chain: 'sol',
      kind: 'signal_subscription',
      token: null,
      wallet: null,
      keyword: null,
      direction: null,
      value: 0,
      repeat: true,
      enabled: true,
      createdAt: 0,
      lastTriggeredAt: null,
      note: '',
      signals: { name: 'Two', maxPerHour: 10, groups: [{ kinds: ['ath'], mcMin: 1, mcMax: 2, excludeRisk: false }, { kinds: ['cto'], excludeRisk: true }] },
    } as AlertRule;
    const update = vi.spyOn(api, 'updateAlert').mockImplementation(async (_id, body) => ({ ...rule, ...body }) as AlertRule);
    open({}, rule);
    fireEvent.change(screen.getByRole('textbox', { name: 'Market cap max (USD)' }), { target: { value: '0.5' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save alert' })));
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByText('Max market cap is below min.')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Market cap max (USD)' }), { target: { value: '5' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save alert' })));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][1].signals).toMatchObject({ name: 'Two', maxPerHour: 10, groups: [{ kinds: ['ath'], mcMax: 5 }, { kinds: ['cto'] }] });
  });
});
