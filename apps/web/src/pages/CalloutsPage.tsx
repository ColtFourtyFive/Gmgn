// Call-outs (/:chain/callouts): the chain's public token calls (KOL call
// signals) newest first with all / KOL / hits filters. Each call shows its
// caller, the MC at the call and how far the token ran since; a side panel
// ranks the callers of the loaded calls by hit rate.

import { useMemo, useRef, useState } from 'react';
import { CHAINS, formatInt, formatPercent, type CalloutFilter, type ChainId, type Signal } from '@trenchscope/shared';
import { MessageSquareQuote, Radio, Trophy } from 'lucide-react';
import { aggregateCallers, CallHeader, callerOf, CallRow, TopCallersPanel, useCallerDirectory, useCallouts, type CallerDirectory } from '@/components/callouts';
import { StatTile } from '@/components/common';
import { LiveStatus, QuickBuyAmount, useQuickBuyAmount } from '@/components/discovery';
import { Page, PageHeader } from '@/components/layout';
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton } from '@/components/ui';
import { CALL_HIT_MULTIPLE, Multiple } from '@/components/wallet';
import { useBreakpoint, useLocalStorage } from '@/hooks';
import { useChain } from '@/lib/chain';

const PAGE = 60;
const FILTERS: { value: CalloutFilter; label: string; hint: string }[] = [
  { value: 'all', label: 'All calls', hint: 'Every public call' },
  { value: 'kol', label: 'KOLs', hint: 'Calls by wallets tagged KOL' },
  { value: 'hits', label: 'Hits 2x+', hint: 'Calls whose token reached 2x the market cap at the call' },
];

export default function CalloutsPage() {
  const chain = useChain();
  return <Callouts key={chain} chain={chain} />;
}

function FeedSkeleton() {
  return (
    <ul aria-busy className="flex flex-col">
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-line/60 px-3 py-2.5">
          <Skeleton className="h-3 w-8" />
          <Skeleton circle width={18} height={18} />
          <Skeleton className={i % 2 ? 'h-3 w-24' : 'h-3 w-32'} />
          <Skeleton className="ml-auto h-3 w-40" />
        </li>
      ))}
    </ul>
  );
}

function Summary({ calls, callers }: { calls: Signal[]; callers: number }) {
  const { hits, best } = useMemo(() => {
    let h = 0;
    let b: Signal | null = null;
    for (const s of calls) {
      if (s.maxMultiple >= CALL_HIT_MULTIPLE) h++;
      if (!b || s.maxMultiple > b.maxMultiple) b = s;
    }
    return { hits: h, best: b };
  }, [calls]);
  const n = calls.length;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatTile label="Calls" value={formatInt(n)} sub={n > 0 ? 'newest first' : 'waiting…'} />
      <StatTile
        label="Hit 2x+"
        hint="Calls whose token reached at least 2x the market cap at the call"
        value={<span className="text-up">{formatInt(hits)}</span>}
        sub={n > 0 ? `${formatPercent(hits / n, { sign: false, digits: 0 })} hit rate` : '--'}
      />
      <StatTile label="Best call" value={best ? <Multiple value={best.maxMultiple} /> : '--'} sub={best ? `$${best.token.symbol}` : '--'} />
      <StatTile label="Callers" value={formatInt(callers)} sub="distinct wallets" />
    </div>
  );
}

function Callouts({ chain }: { chain: ChainId }) {
  const wide = useBreakpoint('lg');
  const mobile = !useBreakpoint('md');
  const [stored, setFilter] = useLocalStorage<CalloutFilter>('ts.callouts.filter', 'all');
  const filter = FILTERS.some((f) => f.value === stored) ? stored : 'all';
  const [section, setSection] = useState<'feed' | 'callers'>('feed');
  const [limit, setLimit] = useState(PAGE);
  const [buyAmount, setBuyAmount] = useQuickBuyAmount(chain);

  // Pushed calls join the KOL feed when the directory knows the caller as a KOL (read at push time);
  // a call only becomes a hit later, so the hits feed refreshes from REST.
  const directoryRef = useRef<CallerDirectory>(() => null);
  const feed = useCallouts(chain, filter, (s) => filter === 'all' || (filter === 'kol' && !!directoryRef.current(callerOf(s))?.tags.includes('kol')));
  const callers = useMemo(() => [...new Set(feed.calls.map(callerOf))], [feed.calls]);
  const directory = useCallerDirectory(chain, callers);
  directoryRef.current = directory;
  const ranked = useMemo(() => aggregateCallers(feed.calls), [feed.calls]);

  const onFilter = (f: CalloutFilter) => {
    setLimit(PAGE);
    setFilter(f);
  };

  const headerActions = (
    <>
      <LiveStatus live={feed.live} error={!!feed.error} cadence="on call" />
      <QuickBuyAmount chain={chain} value={buyAmount} onChange={setBuyAmount} className={mobile ? 'ml-auto' : undefined} />
    </>
  );

  const feedPanel = (
    <section className="panel flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Calls">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <SegmentedControl size="sm" aria-label="Calls to show" value={filter} onChange={onFilter} items={FILTERS.map((f) => ({ value: f.value, label: f.label, title: f.hint }))} />
        <span className="num ml-auto text-xs text-muted">{formatInt(feed.calls.length)} calls</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CallHeader />
        {feed.error ? (
          <ErrorState error={feed.error} onRetry={feed.retry} retrying={feed.retrying} />
        ) : feed.loading ? (
          <FeedSkeleton />
        ) : feed.calls.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote size={18} />}
            title={filter === 'hits' ? 'No calls have hit 2x yet' : 'Waiting for calls'}
            description={filter === 'hits' ? 'Calls appear here once their token doubles from the market cap at the call.' : 'KOL calls show up here the moment they are made.'}
          />
        ) : (
          <>
            <ul aria-label="Calls, newest first" aria-live="off">
              {feed.calls.slice(0, limit).map((s) => (
                <CallRow key={s.id} call={s} caller={directory(callerOf(s))} buyAmount={buyAmount} fresh={feed.freshIds.has(s.id)} mobile={mobile} />
              ))}
            </ul>
            {feed.calls.length > limit && (
              <div className="flex justify-center p-3">
                <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more ({formatInt(feed.calls.length - limit)})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );

  const top = <TopCallersPanel chain={chain} callers={ranked} directory={directory} loading={feed.loading} className={wide ? 'max-h-full' : 'min-h-0 flex-1'} />;

  return (
    <Page fullHeight className="max-w-[1800px]">
      <PageHeader
        title="Call-outs"
        icon={<MessageSquareQuote size={16} />}
        subtitle={`Public token calls on ${CHAINS[chain].name} and how far each token ran since`}
        actions={mobile ? undefined : headerActions}
      />
      {mobile && <div className="mb-3 flex flex-wrap items-center gap-2">{headerActions}</div>}
      {!feed.error && (
        <div className="mb-3 shrink-0">
          <Summary calls={feed.calls} callers={callers.length} />
        </div>
      )}
      {!wide && (
        <SegmentedControl
          aria-label="Call-outs section"
          value={section}
          onChange={setSection}
          className="mb-3 w-full [&>button]:flex-1 [&>button]:justify-center"
          items={[
            { value: 'feed', label: 'Calls', icon: <Radio size={13} /> },
            { value: 'callers', label: 'Top callers', icon: <Trophy size={13} />, count: ranked.length || null },
          ]}
        />
      )}
      {wide ? (
        <div className="flex min-h-0 flex-1 gap-3">
          {feedPanel}
          <aside className="flex w-[340px] shrink-0 flex-col" aria-label="Top callers">
            {top}
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{section === 'feed' ? feedPanel : top}</div>
      )}
    </Page>
  );
}
