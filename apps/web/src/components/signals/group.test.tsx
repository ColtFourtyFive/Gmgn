import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Signal, SignalKind } from '@trenchscope/shared';
import { groupSignals } from './group';
import { SignalGroupCard } from './SignalGroupCard';

afterEach(cleanup);

const token = (address: string, marketCapUsd = 50_000) => ({ chain: 'sol', address, symbol: address, name: address, logoSeed: address, logoGlyph: 'x', marketCapUsd, priceChange24h: 0.1 });
const sig = (id: string, address: string, kind: SignalKind, createdAt: number, extra: Partial<Signal> = {}): Signal =>
  ({ id, chain: 'sol', kind, token: token(address), title: kind, detail: `${kind} on ${address}`, marketCapAtTrigger: 10_000 + createdAt, maxMultiple: 1, wallets: [], createdAt, ...extra }) as unknown as Signal;

describe('grouped signal feed', () => {
  it('groups by token in order of the latest signal, with kinds newest first and the server history', () => {
    const groups = groupSignals([
      sig('c', 'A', 'kol_buy', 3, { firstTriggerMcUsd: 9_000, timesFired: 7, timesFiredByKind: { smart_buy: 5, kol_buy: 2 } }),
      sig('b', 'B', 'dev_sell', 2),
      sig('a', 'A', 'smart_buy', 1),
    ]);
    expect(groups.map((g) => [g.key, g.latest.id, g.kinds, g.timesFired, g.firstTriggerMcUsd, g.bearish])).toEqual([
      ['sol:A', 'c', ['kol_buy', 'smart_buy'], 7, 9_000, false],
      // without server history: counted from the listed signals
      ['sol:B', 'b', ['dev_sell'], 1, 10_002, true],
    ]);
    expect(groups[0].timesFiredByKind).toEqual({ smart_buy: 5, kol_buy: 2 });
  });

  it('renders a token row: stacked kinds, first-signal market cap, times fired per kind and holder context', () => {
    const [group] = groupSignals([
      sig('b', 'PEPE', 'kol_buy', 2, { firstTriggerMcUsd: 25_000, timesFired: 4, timesFiredByKind: { smart_buy: 3, kol_buy: 1 }, cur: { holders: 321, top10: 0.18, liquidityUsd: 12_000 } }),
      sig('a', 'PEPE', 'smart_buy', 1),
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SignalGroupCard group={group} buyAmount={0.5} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const card = screen.getByRole('article', { name: 'PEPE: 2 signals, latest KOL buy' });
    expect(within(card).getByText('KOL buy')).toBeTruthy();
    expect(within(card).getByText('Smart buy')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Fired 4 times: Smart buy 3, KOL buy 1' }).textContent).toBe('×4');
    expect(within(card).getByText('321 holders')).toBeTruthy();
    expect(within(card).getByText('Top10 18%')).toBeTruthy();
    // 50k now vs 25k at the first signal
    expect(card.textContent).toContain('Since first2x');
  });
});
