import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { PortfolioSummary } from '@trenchscope/shared';
import { Activity, ChartLine, History, ListChecks, Wallet } from 'lucide-react';
import { AccountGate, ChainFilter, EquityChart, accountKeys, parseScope, useSignedIn, type ChainScope } from '@/components/account';
import { ActivityTable } from '@/components/account/portfolio/ActivityTable';
import { OrdersTable } from '@/components/account/portfolio/OrdersTable';
import { PositionsTable } from '@/components/account/portfolio/PositionsTable';
import { WalletsStrip } from '@/components/account/portfolio/WalletsStrip';
import { FlashValue, Pct, StatTile, Usd } from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { ErrorState, Panel, SegmentedControl, Skeleton, Spinner, Tabs } from '@/components/ui';
import { serverNow, useIsMobile } from '@/hooks';
import { api } from '@/lib/api';

type PortfolioTab = 'positions' | 'open' | 'history' | 'activity';
const TABS: PortfolioTab[] = ['positions', 'open', 'history', 'activity'];

type EquityRange = '1h' | '6h' | '24h' | '7d';
const RANGE_MS: Record<EquityRange, number> = { '1h': 3_600_000, '6h': 6 * 3_600_000, '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000 };
const RANGES = (Object.keys(RANGE_MS) as EquityRange[]).map((r) => ({ value: r, label: r.toUpperCase() }));

export default function PortfolioPage() {
  const signedIn = useSignedIn();
  const [params, setParams] = useSearchParams();
  const scope = parseScope(params.get('chain'));
  const tabParam = params.get('tab') as PortfolioTab | null;
  const tab: PortfolioTab = tabParam && TABS.includes(tabParam) ? tabParam : 'positions';

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  return (
    <Page className="max-w-[1680px]">
      <PageHeader
        title="Portfolio"
        subtitle="Paper wallets, positions, orders and trade history"
        icon={<Wallet size={16} />}
        actions={signedIn ? <ChainFilter value={scope} onChange={(v) => setParam('chain', v === 'all' ? null : v)} className="hidden sm:inline-flex" /> : undefined}
      />
      {signedIn && (
        // Phones: the filter gets its own row so the title keeps its width.
        <ChainFilter value={scope} onChange={(v) => setParam('chain', v === 'all' ? null : v)} className="-mt-1 mb-3 flex sm:hidden" />
      )}
      <AccountGate
        icon={<Wallet size={22} />}
        title="Track your paper portfolio"
        description="Sign in to see your balances, open positions, PnL and every trade across Solana, BNB Chain, Base and Ethereum."
        features={['Live PnL and equity curve', 'One-click 25 / 50 / 100% sells', 'Open orders, order history and trade log']}
      >
        <PortfolioBody scope={scope} tab={tab} onTab={(t) => setParam('tab', t === 'positions' ? null : t)} />
      </AccountGate>
    </Page>
  );
}

function PortfolioBody({ scope, tab, onTab }: { scope: ChainScope; tab: PortfolioTab; onTab: (t: PortfolioTab) => void }) {
  const chain = scope === 'all' ? undefined : scope;
  const showChain = scope === 'all';

  const summary = useQuery({
    queryKey: accountKeys.portfolio(scope),
    queryFn: () => api.portfolio(scope),
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
  });
  const open = useQuery({
    queryKey: accountKeys.orders('open', scope),
    queryFn: () => api.orders({ status: 'open', chain }),
    refetchInterval: 10_000,
  });
  const history = useQuery({
    queryKey: accountKeys.orders('history', scope),
    queryFn: () => api.orders({ status: 'history', chain }),
    enabled: tab === 'history',
  });
  const activity = useQuery({
    queryKey: accountKeys.activity(scope),
    queryFn: () => api.portfolioActivity({ chain, limit: 200 }),
    enabled: tab === 'activity',
    refetchInterval: 15_000,
  });

  const data = summary.data;
  const tabs = [
    { value: 'positions' as const, label: 'Positions', icon: <Wallet size={13} />, count: data?.positions.length },
    { value: 'open' as const, label: 'Open orders', icon: <ListChecks size={13} />, count: open.data?.length },
    { value: 'history' as const, label: 'Order history', icon: <History size={13} /> },
    { value: 'activity' as const, label: 'Activity', icon: <Activity size={13} /> },
  ];

  return (
    <div className="flex flex-col gap-3">
      {summary.isError && !data ? (
        <Panel>
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />
        </Panel>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Overview summary={data} refreshing={summary.isPlaceholderData} />
          <EquityPanel summary={data} />
        </div>
      )}

      <WalletsStrip scope={scope} />

      <Panel padded={false} className="min-h-[320px]">
        <Tabs value={tab} onChange={onTab} items={tabs} aria-label="Portfolio sections" className="px-2" />
        <div role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
          {tab === 'positions' &&
            (summary.isError && !data ? (
              <ErrorState compact error={summary.error} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />
            ) : (
              <PositionsTable rows={data?.positions ?? []} loading={summary.isLoading} showChain={showChain} />
            ))}
          {tab === 'open' &&
            (open.isError ? (
              <ErrorState compact error={open.error} onRetry={() => void open.refetch()} retrying={open.isFetching} />
            ) : (
              <OrdersTable mode="open" rows={open.data ?? []} loading={open.isLoading} showChain={showChain} />
            ))}
          {tab === 'history' &&
            (history.isError ? (
              <ErrorState compact error={history.error} onRetry={() => void history.refetch()} retrying={history.isFetching} />
            ) : (
              <OrdersTable mode="history" rows={history.data ?? []} loading={history.isLoading} showChain={showChain} />
            ))}
          {tab === 'activity' &&
            (activity.isError ? (
              <ErrorState compact error={activity.error} onRetry={() => void activity.refetch()} retrying={activity.isFetching} />
            ) : (
              <ActivityTable rows={activity.data ?? []} loading={activity.isLoading} showChain={showChain} />
            ))}
        </div>
      </Panel>
    </div>
  );
}

function Overview({ summary, refreshing }: { summary: PortfolioSummary | undefined; refreshing: boolean }) {
  if (!summary) {
    return (
      <Panel title="Overview" icon={<Wallet size={14} />}>
        <Skeleton className="mb-3 h-9 w-48" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[58px]" />
          ))}
        </div>
      </Panel>
    );
  }
  const s = summary;
  return (
    <Panel title="Overview" icon={<Wallet size={14} />} actions={refreshing ? <Spinner size={12} label="Updating" /> : undefined}>
      <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-1">
        <div>
          <p className="text-xs text-muted">Total value</p>
          <FlashValue value={s.totalValueUsd}>
            <Usd value={s.totalValueUsd} className="text-2xl font-semibold tracking-tight text-fg" />
          </FlashValue>
        </div>
        <p className="pb-1 text-sm">
          <Usd value={s.totalPnlUsd} colored signed /> <span className="text-muted">total PnL</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Cash (native)" hint="USD value of your native balances" value={<Usd value={s.nativeBalanceUsd} />} />
        <StatTile
          label="Holdings"
          value={
            <FlashValue value={s.holdingsValueUsd}>
              <Usd value={s.holdingsValueUsd} />
            </FlashValue>
          }
          sub={`${s.positions.length} open position${s.positions.length === 1 ? '' : 's'}`}
        />
        <StatTile label="Win rate" hint="Tokens traded with positive total PnL" value={<Pct value={s.winRate} sign={false} colored={false} digits={1} />} />
        <StatTile label="Realized PnL" value={<Usd value={s.realizedPnlUsd} colored signed />} />
        <StatTile
          label="Unrealized PnL"
          value={
            <FlashValue value={s.unrealizedPnlUsd}>
              <Usd value={s.unrealizedPnlUsd} colored signed />
            </FlashValue>
          }
        />
        <StatTile label="Total PnL" value={<Usd value={s.totalPnlUsd} colored signed />} />
      </div>
    </Panel>
  );
}

function EquityPanel({ summary }: { summary: PortfolioSummary | undefined }) {
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const range = (params.get('range') as EquityRange | null) ?? '24h';
  const active: EquityRange = range in RANGE_MS ? range : '24h';

  const points = useMemo(() => {
    if (!summary) return [];
    const now = serverNow();
    const from = now - RANGE_MS[active];
    const pts = summary.equity.filter((p) => p.t >= from);
    const last = summary.equity[summary.equity.length - 1];
    // Anchor the window start to the last sample before it so the line spans the whole range.
    const before = [...summary.equity].reverse().find((p) => p.t < from);
    if (before) pts.unshift({ t: from, valueUsd: before.valueUsd });
    if (!last || now - last.t > 1000) pts.push({ t: now, valueUsd: summary.totalValueUsd });
    return pts;
  }, [summary, active]);

  const first = points[0]?.valueUsd;
  const lastValue = points[points.length - 1]?.valueUsd;
  const delta = first !== undefined && lastValue !== undefined ? lastValue - first : null;

  return (
    <Panel
      title="Equity"
      icon={<ChartLine size={14} />}
      subtitle={
        delta !== null && points.length > 1 ? (
          <>
            <Usd value={delta} colored signed /> <Pct value={first ? delta / first : null} />
          </>
        ) : undefined
      }
      actions={
        <SegmentedControl
          size="sm"
          value={active}
          items={RANGES}
          aria-label="Equity range"
          onChange={(r) =>
            setParams(
              (p) => {
                const next = new URLSearchParams(p);
                next.set('range', r);
                return next;
              },
              { replace: true },
            )
          }
        />
      }
      padded={false}
    >
      {summary ? <EquityChart points={points} height={mobile ? 180 : 232} className="px-1 pb-1" /> : <Skeleton className="m-3 h-[208px]" />}
    </Panel>
  );
}
