// Wallet page "Calls" tab: the wallet's public calls (kol_call signals) with
// 7D / 30D hit rates (a hit reached 2x the market cap at the call), the mean
// best multiple and how each call played out: a sortable table, stacked rows
// on phones (no sideways scrolling).

import { memo, useMemo, type ReactNode } from 'react';
import { formatInt, type Signal } from '@trenchscope/shared';
import { MessageSquareQuote } from 'lucide-react';
import clsx from 'clsx';
import { Age, Pct, StatTile, TokenLink, Usd } from '@/components/common';
import { Badge, DataTable, EmptyState, ErrorState, Skeleton, type Column } from '@/components/ui';
import { useBreakpoint } from '@/hooks/useMediaQuery';
import { useOpenLink } from '@/hooks/useOpenLink';
import { routes } from '@/lib/chain';
import { Multiple } from './Multiple';
import { useWalletCalls } from './queries';
import type { WalletTableProps } from './WalletTables';

/** A call hits once the token reaches this multiple of its market cap at the call. */
export const CALL_HIT_MULTIPLE = 2;

/** Hit rate as a percent: green from 50%, red under 20%. */
export const HitRate = memo(function HitRate({ value, className }: { value: number | null | undefined; className?: string }) {
  const tone = value === null || value === undefined ? undefined : value >= 0.5 ? 'text-up' : value < 0.2 ? 'text-down' : undefined;
  return <Pct value={value} sign={false} colored={false} digits={0} className={clsx('font-semibold', tone, className)} />;
});

const nowMultiple = (s: Signal) => (s.marketCapAtTrigger > 0 ? s.token.marketCapUsd / s.marketCapAtTrigger : null);

const callColumns: Column<Signal>[] = [
  { key: 'token', header: 'Token', sticky: true, width: 190, render: (s) => <TokenLink token={s.token} size={26} showName /> },
  { key: 'called', header: 'Called', align: 'right', sortable: true, sortValue: (s) => s.createdAt, render: (s) => <Age ts={s.createdAt} suffix=" ago" className="text-muted" /> },
  { key: 'mcap', header: 'MC at call', align: 'right', sortable: true, sortValue: (s) => s.marketCapAtTrigger, render: (s) => <Usd value={s.marketCapAtTrigger} /> },
  {
    key: 'max',
    header: 'Max since',
    title: 'Highest market cap since the call / market cap at the call',
    align: 'right',
    sortable: true,
    sortValue: (s) => s.maxMultiple,
    render: (s) => <Multiple value={s.maxMultiple} />,
  },
  { key: 'now', header: 'Now', align: 'right', sortable: true, sortValue: nowMultiple, render: (s) => <Multiple value={nowMultiple(s)} /> },
  { key: 'result', header: 'Result', align: 'right', render: (s) => <CallResult call={s} /> },
];

function CallResult({ call }: { call: Signal }) {
  return call.maxMultiple >= CALL_HIT_MULTIPLE ? <Badge tone="up">Hit 2x+</Badge> : <span className="text-xs text-faint">Open</span>;
}

function CallFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <dt className="text-2xs text-faint">{label}</dt>
      <dd className="truncate text-xs">{children}</dd>
    </div>
  );
}

/** Phone row: the token and result, then the table's figures in a 4-up grid. */
const CallItem = memo(function CallItem({ call: s }: { call: Signal }) {
  return (
    <li className="flex flex-col gap-1.5 border-b border-line/60 px-3 py-2 last:border-b-0">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <TokenLink token={s.token} size={26} showName className="min-w-0" />
        <CallResult call={s} />
      </span>
      <dl className="grid grid-cols-4 gap-2">
        <CallFigure label="Called">
          <Age ts={s.createdAt} suffix=" ago" className="text-muted" />
        </CallFigure>
        <CallFigure label="MC at call">
          <Usd value={s.marketCapAtTrigger} />
        </CallFigure>
        <CallFigure label="Max since">
          <Multiple value={s.maxMultiple} />
        </CallFigure>
        <CallFigure label="Now">
          <Multiple value={nowMultiple(s)} />
        </CallFigure>
      </dl>
    </li>
  );
});

const EMPTY = <EmptyState compact icon={<MessageSquareQuote size={16} />} title="No calls yet" description="Public calls this wallet makes show up here with how they played out." />;

/** Phones: the calls newest first, stacked. */
function CallList({ calls, loading }: { calls: Signal[]; loading: boolean }) {
  if (loading) {
    return (
      <ul aria-busy className="flex flex-col">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex flex-col gap-2 border-b border-line/60 px-3 py-2.5">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-full" />
          </li>
        ))}
      </ul>
    );
  }
  if (calls.length === 0) return EMPTY;
  return (
    <ul aria-label="Calls by this wallet, newest first" className="flex flex-col">
      {calls.map((s) => (
        <CallItem key={s.id} call={s} />
      ))}
    </ul>
  );
}

/** The wallet's calls, newest first, with hit rates. */
export const CallsTab = memo(function CallsTab({ chain, address }: WalletTableProps) {
  const openLink = useOpenLink();
  const stacked = !useBreakpoint('sm');
  const q = useWalletCalls(chain, address);
  const d = q.data;
  const hits = useMemo(() => d?.calls.filter((s) => s.maxMultiple >= CALL_HIT_MULTIPLE).length ?? 0, [d]);
  if (q.isError && !d) return <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} compact />;
  return (
    <div className="flex flex-col">
      {d && (
        <div className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-4">
          <StatTile label="Hit rate 7D" hint="Calls of the last 7 days that reached 2x the market cap at the call" value={<HitRate value={d.hitRate7d} />} />
          <StatTile label="Hit rate 30D" hint="Calls of the last 30 days that reached 2x the market cap at the call" value={<HitRate value={d.hitRate30d} />} />
          <StatTile label="Avg max multiple" hint="Mean of the best multiple each call of the last 30 days reached" value={<Multiple value={d.avgMaxMultiple > 0 ? d.avgMaxMultiple : null} />} />
          <StatTile label="Calls" value={formatInt(d.calls.length)} sub={`${formatInt(hits)} hit 2x+`} />
        </div>
      )}
      {stacked ? (
        <CallList calls={d?.calls ?? []} loading={q.isLoading} />
      ) : (
        <DataTable
          aria-label="Calls by this wallet"
          columns={callColumns}
          rows={d?.calls ?? []}
          rowKey={(s) => s.id}
          loading={q.isLoading}
          defaultSort={{ key: 'called', dir: 'desc' }}
          minWidth={620}
          maxHeight={560}
          onRowClick={(s, e) => openLink(routes.token(s.chain, s.token.address), e)}
          empty={EMPTY}
        />
      )}
    </div>
  );
});
