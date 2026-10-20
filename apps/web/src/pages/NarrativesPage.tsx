// Narratives: meme themes ranked by heat (GET /:chain/narratives, refreshed
// every 10s). Each card expands into the theme's top tokens.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CHAINS, type ChainId, type Narrative, type TokenRef } from '@trenchscope/shared';
import { ChevronDown, Flame, Layers } from 'lucide-react';
import clsx from 'clsx';
import { Age, FlashValue, Pct, StatTile, TokenLink, Usd } from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { DataTable, EmptyState, ErrorState, SegmentedControl, Skeleton, type Column } from '@/components/ui';
import { useQuickBuyAmount } from '@/components/discovery';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useOpenLink } from '@/hooks/useOpenLink';
import { useStickyError } from '@/hooks/useStickyError';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';

type NarrativeSort = 'heat' | 'volume' | 'change' | 'tokens';

const SORTS: { value: NarrativeSort; label: string }[] = [
  { value: 'heat', label: 'Heat' },
  { value: 'volume', label: 'Vol 1h' },
  { value: 'change', label: 'Δ 1h' },
  { value: 'tokens', label: 'Tokens' },
];

const SORT_VALUE: Record<NarrativeSort, (n: Narrative) => number> = {
  heat: (n) => n.heat,
  volume: (n) => n.volume1hUsd,
  change: (n) => n.change1h,
  tokens: (n) => n.tokenCount,
};

export default function NarrativesPage() {
  const chain = useChain();
  return <Narratives key={chain} chain={chain} />;
}

function HeatBar({ heat }: { heat: number }) {
  const h = Math.max(0, Math.min(100, heat));
  return (
    <div className="flex items-center gap-2" title={`Heat ${Math.round(h)} / 100`}>
      <span
        role="meter"
        aria-label="Heat"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(h)}
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel-3"
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-down transition-[width] duration-700" style={{ width: `${h}%` }} />
      </span>
      <span className={clsx('num w-7 shrink-0 text-right text-xs font-semibold', h >= 70 ? 'text-down' : h >= 40 ? 'text-accent' : 'text-muted')}>{Math.round(h)}</span>
    </div>
  );
}

function tokenColumns(buyAmount: number, chain: ChainId): Column<TokenRef>[] {
  return [
    { key: 'token', header: 'Token', render: (t) => <TokenLink token={t} size={22} showName showLaunchpad /> },
    {
      key: 'mcap',
      header: 'MCap',
      align: 'right',
      render: (t) => (
        <FlashValue value={t.marketCapUsd}>
          <Usd value={t.marketCapUsd} className="text-fg" />
        </FlashValue>
      ),
    },
    { key: 'liq', header: 'Liq', align: 'right', hideBelow: 'sm', render: (t) => <Usd value={t.liquidityUsd} /> },
    { key: 'chg', header: '24h', align: 'right', render: (t) => <Pct value={t.priceChange24h} digits={1} /> },
    { key: 'age', header: 'Age', align: 'right', hideBelow: 'sm', render: (t) => <Age ts={t.createdAt} className="text-muted" /> },
    {
      key: 'buy',
      header: <span className="sr-only">Quick buy</span>,
      align: 'right',
      render: (t) => <QuickBuyButton chain={chain} token={t.address} symbol={t.symbol} amount={buyAmount} />,
    },
  ];
}

function NarrativeCard({ n, rank, expanded, onToggle, columns }: { n: Narrative; rank: number; expanded: boolean; onToggle: () => void; columns: Column<TokenRef>[] }) {
  const openLink = useOpenLink();
  const bodyId = `narrative-${n.id}`;
  return (
    <article className={clsx('panel flex min-w-0 flex-col', expanded && 'border-line-strong sm:col-span-2 xl:col-span-3')}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={bodyId}
        className="flex items-center gap-3 rounded-t px-3 pt-3 text-left transition-colors hover:bg-panel-2/60"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded bg-panel-3 text-2xl leading-none" aria-hidden>
          {n.glyph}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="num text-xs text-faint">#{rank}</span>
            <h2 className="truncate text-md font-semibold text-fg">{n.name}</h2>
          </span>
          <span className="text-xs text-muted">
            <span className="num text-fg">{n.tokenCount}</span> tokens · MC <Usd value={n.marketCapUsd} className="text-fg" />
          </span>
        </span>
        <ChevronDown size={16} className={clsx('shrink-0 text-faint transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>
      <div className="flex flex-col gap-2.5 px-3 pb-3 pt-2.5">
        <HeatBar heat={n.heat} />
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col">
            <dt className="text-faint">Vol 1h</dt>
            <dd className="text-sm font-medium">
              <FlashValue value={n.volume1hUsd}>
                <Usd value={n.volume1hUsd} />
              </FlashValue>
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-faint">Vol 24h</dt>
            <dd className="text-sm font-medium">
              <Usd value={n.volume24hUsd} />
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-faint">Δ 1h</dt>
            <dd className="text-sm font-medium">
              <Pct value={n.change1h} digits={1} />
            </dd>
          </div>
        </dl>
        {!expanded && n.topTokens.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label={`Top ${n.name} tokens`}>
            {n.topTokens.slice(0, 5).map((t) => (
              <li key={t.address} className="flex min-w-0 max-w-[48%] items-center gap-1 rounded border border-line bg-panel-2 py-0.5 pl-1 pr-1.5 sm:max-w-none">
                <TokenLink token={t} size={16} className="min-w-0 text-xs" />
                <Pct value={t.priceChange24h} digits={0} className="text-2xs" />
              </li>
            ))}
          </ul>
        )}
      </div>
      {expanded && (
        <div id={bodyId} className="border-t border-line">
          <DataTable
            aria-label={`${n.name} top tokens`}
            columns={columns}
            rows={n.topTokens}
            rowKey={(t) => t.address}
            onRowClick={(t, e) => openLink(routes.token(t.chain, t.address), e)}
            compact
            empty={<EmptyState compact title="No active tokens" description="None of this theme’s tokens traded recently." />}
          />
        </div>
      )}
    </article>
  );
}

function Narratives({ chain }: { chain: ChainId }) {
  const q = useQuery({ queryKey: ['narratives', chain], queryFn: () => api.narratives(chain), refetchInterval: 10_000, staleTime: 5_000 });
  const failed = useStickyError(q);
  const [rawSort, setSort] = useLocalStorage<NarrativeSort>('ts.narratives.sort', 'heat');
  const sort: NarrativeSort = rawSort in SORT_VALUE ? rawSort : 'heat';
  const [expanded, setExpanded] = useState<string | null>(null);
  const [buyAmount] = useQuickBuyAmount(chain);
  const columns = useMemo(() => tokenColumns(buyAmount, chain), [buyAmount, chain]);

  const list = useMemo(() => {
    const get = SORT_VALUE[sort];
    return (q.data ?? []).slice().sort((a, b) => get(b) - get(a) || b.heat - a.heat);
  }, [q.data, sort]);
  const byHeat = useMemo(() => (q.data ?? []).slice().sort((a, b) => b.heat - a.heat), [q.data]);
  const hottest = byHeat[0];
  const fastest = useMemo(() => (q.data ?? []).filter((n) => n.volume1hUsd > 0).sort((a, b) => b.change1h - a.change1h)[0], [q.data]);
  const vol1h = (q.data ?? []).reduce((s, n) => s + n.volume1hUsd, 0);

  return (
    <Page>
      <PageHeader
        title="Narratives"
        icon={<Layers size={16} />}
        subtitle={<span className="hidden sm:inline">Meme themes on {CHAINS[chain].name}, ranked by trading heat</span>}
        actions={<SegmentedControl value={sort} onChange={setSort} items={SORTS} aria-label="Sort narratives" />}
      />
      {failed !== null && !q.data ? (
        <div className="panel">
          <ErrorState title="Couldn’t load narratives" error={failed} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        </div>
      ) : q.isLoading ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[60px]" />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[178px]" />
            ))}
          </div>
        </>
      ) : list.length === 0 ? (
        <div className="panel">
          <EmptyState icon={<Layers size={18} />} title="No narratives yet" description="Themes appear once tokens start trading on this chain." />
        </div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatTile label="Narratives" value={list.length} sub={`${list.reduce((s, n) => s + n.tokenCount, 0)} tokens`} />
            <StatTile
              label="Hottest"
              icon={<Flame size={12} className="text-down" />}
              value={hottest ? `${hottest.glyph} ${hottest.name}` : '--'}
              sub={hottest ? `Heat ${Math.round(hottest.heat)}` : undefined}
            />
            <StatTile label="Fastest 1h" value={fastest ? `${fastest.glyph} ${fastest.name}` : '--'} sub={fastest ? <Pct value={fastest.change1h} digits={1} /> : undefined} />
            <StatTile label="Volume 1h (all)" value={<Usd value={vol1h} />} sub="Refreshes every 10s" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((n) => (
              <NarrativeCard
                key={n.id}
                n={n}
                rank={byHeat.indexOf(n) + 1}
                expanded={expanded === n.id}
                onToggle={() => setExpanded((e) => (e === n.id ? null : n.id))}
                columns={columns}
              />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
