// Portfolio "Calendar" tab (PRD §6.15): the account's daily realized PnL over
// the last 30 UTC days, summed over its wallets on the selected chains. Reuses
// the wallet page's calendar, with the month's totals beside it.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PortfolioCalendar } from '@trenchscope/shared';
import { CalendarDays } from 'lucide-react';
import { StatTile, Usd } from '@/components/common';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { PnlCalendar } from '@/components/wallet';
import { api } from '@/lib/api';
import { accountKeys, type ChainScope } from '../queries';

const DAY_FMT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };

/** Totals of a calendar: sum, best / worst day, green / red days. */
export function calendarTotals(days: PortfolioCalendar['days']) {
  let total = 0;
  let best: PortfolioCalendar['days'][number] | null = null;
  let worst: PortfolioCalendar['days'][number] | null = null;
  let green = 0;
  let red = 0;
  for (const d of days) {
    total += d.pnlUsd;
    if (d.pnlUsd > 0) green++;
    if (d.pnlUsd < 0) red++;
    if (d.pnlUsd > 0 && (!best || d.pnlUsd > best.pnlUsd)) best = d;
    if (d.pnlUsd < 0 && (!worst || d.pnlUsd < worst.pnlUsd)) worst = d;
  }
  return { total, best, worst, green, red };
}

const dayLabel = (d: { day: number } | null) => (d ? new Date(d.day).toLocaleDateString('en-US', DAY_FMT) : '--');

export function CalendarPanel({ scope }: { scope: ChainScope }) {
  const q = useQuery({
    queryKey: accountKeys.calendar(scope),
    queryFn: () => api.portfolioCalendar(scope),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  const days = q.data?.days;
  const totals = useMemo(() => calendarTotals(days ?? []), [days]);

  if (q.isError && !q.data) return <ErrorState compact error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />;
  if (!days)
    return (
      <div className="grid gap-4 p-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)]" aria-busy>
        <Skeleton className="h-[260px]" />
        <Skeleton className="h-[140px]" />
      </div>
    );
  if (totals.green + totals.red === 0)
    return <EmptyState icon={<CalendarDays size={18} />} title="No realized PnL in the last 30 days" description="Days fill in green or red as you sell: each one sums the realized PnL of that UTC day across your wallets." />;

  return (
    <div className="grid items-start gap-4 p-3 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
      <PnlCalendar days={days} />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="Realized, 30 days" value={<Usd value={totals.total} colored signed />} sub={`${totals.green} green / ${totals.red} red days`} />
        <StatTile label="Best day" value={<Usd value={totals.best?.pnlUsd ?? null} colored signed />} sub={dayLabel(totals.best)} />
        <StatTile label="Worst day" value={<Usd value={totals.worst?.pnlUsd ?? null} colored signed />} sub={dayLabel(totals.worst)} />
        <StatTile label="Daily average" hint="Over days with a realized result" value={<Usd value={totals.total / Math.max(1, totals.green + totals.red)} colored signed />} sub="per active day" />
      </div>
    </div>
  );
}
