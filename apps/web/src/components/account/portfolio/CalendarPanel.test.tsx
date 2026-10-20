import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PortfolioCalendar } from '@trenchscope/shared';
import { api } from '@/lib/api';
import { CalendarPanel, calendarTotals } from './CalendarPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 21);
const month = (values: Record<number, number>): PortfolioCalendar['days'] => Array.from({ length: 30 }, (_, i) => ({ day: START + i * DAY, pnlUsd: values[i] ?? 0 }));

function show() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarPanel scope="all" />
    </QueryClientProvider>,
  );
}

describe('portfolio calendar', () => {
  it('totals the month: sum, best and worst day, green and red days', () => {
    const t = calendarTotals(month({ 2: 120, 5: -40, 9: 300 }));
    expect(t).toMatchObject({ total: 380, green: 2, red: 1 });
    expect(t.best?.day).toBe(START + 9 * DAY);
    expect(t.worst?.pnlUsd).toBe(-40);
  });

  it("shows the account's calendar (all chains) with the month's figures", async () => {
    const read = vi.spyOn(api, 'portfolioCalendar').mockResolvedValue({ chain: 'all', days: month({ 2: 120, 5: -40, 29: 300 }) });
    show();
    const cal = await screen.findByRole('list', { name: 'Daily realized PnL calendar' });
    expect(within(cal).getAllByRole('listitem')).toHaveLength(30);
    expect(within(cal).getByRole('listitem', { name: 'Oct 20: $300' })).toBeTruthy();
    expect(screen.getByText('2 green / 1 red days')).toBeTruthy();
    expect(read).toHaveBeenCalledWith('all');
  });

  it('explains an empty month', async () => {
    vi.spyOn(api, 'portfolioCalendar').mockResolvedValue({ chain: 'all', days: month({}) });
    show();
    expect(await screen.findByText('No realized PnL in the last 30 days')).toBeTruthy();
  });
});
