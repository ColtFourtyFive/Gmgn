// Signals (/:chain/signals): live token signals (smart/KOL buys, clusters,
// whale buys, spikes, ATHs, milestones, migrations, dev/bundler sells …) as
// cards, newest first, with kind filter chips and a 2x hit-rate summary.

import { useMemo, useState } from 'react';
import { CHAINS, formatInt, formatPercent, type ChainId, type Signal, type SignalKind } from '@trenchscope/shared';
import { Radio, RotateCcw, Target } from 'lucide-react';
import clsx from 'clsx';
import { StatTile } from '@/components/common';
import { LiveStatus, QuickBuyAmount, useQuickBuyAmount } from '@/components/discovery';
import { Page, PageHeader } from '@/components/layout';
import { SIGNAL_META, SIGNAL_ORDER, SignalCard, useSignals } from '@/components/signals';
import { Button, EmptyState, ErrorState, Skeleton, Toggle } from '@/components/ui';
import { Multiple } from '@/components/wallet';
import { useIsMobile, useLocalStorage } from '@/hooks';
import { useChain } from '@/lib/chain';

const PAGE = 60;

export default function SignalsPage() {
  const chain = useChain();
  return <Signals key={chain} chain={chain} />;
}

function KindChip({ kind, active, count, onClick }: { kind: SignalKind | null; active: boolean; count: number; onClick: () => void }) {
  const meta = kind ? SIGNAL_META[kind] : null;
  const Icon = meta?.icon;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      title={meta?.description}
      className={clsx(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        active ? 'border-transparent text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg',
      )}
      style={active ? { backgroundColor: meta ? `rgb(var(--${meta.token}) / 0.16)` : 'rgb(var(--accent) / 0.16)', color: meta ? `rgb(var(--${meta.token}))` : 'rgb(var(--accent))' } : undefined}
    >
      {Icon && <Icon size={13} aria-hidden />}
      {meta ? meta.label : 'All'}
      <span className={clsx('num rounded px-1 text-2xs leading-4', active ? 'bg-bg/30' : 'bg-panel-3 text-muted')}>{count}</span>
    </button>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="panel flex flex-col gap-3 p-3">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-10" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton circle width={32} height={32} />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Summary tiles over the listed signals (exported for tests). */
export function Summary({ signals, hitsOnly }: { signals: Signal[]; hitsOnly: boolean }) {
  const stats = useMemo(() => {
    let hits = 0;
    let bearish = 0;
    let best: Signal | null = null;
    for (const s of signals) {
      if (s.maxMultiple >= 2) hits++;
      if (SIGNAL_META[s.kind].sentiment === 'bearish') bearish++;
      if (!best || s.maxMultiple > best.maxMultiple) best = s;
    }
    return { hits, bearish, best };
  }, [signals]);
  const n = signals.length;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <StatTile label="Signals" value={formatInt(n)} sub={n > 0 ? `newest ${SIGNAL_META[signals[0].kind].label.toLowerCase()}` : 'waiting…'} />
      <StatTile
        label="Hit 2x+"
        hint="Signals whose token reached at least 2x the market cap at the signal"
        value={<span className="text-up">{stats.hits}</span>}
        // With the hits filter every listed signal is a hit, so a rate would always read 100% (as on Call-outs).
        sub={hitsOnly ? 'hits filter on' : n > 0 ? `${formatPercent(stats.hits / n, { sign: false, digits: 0 })} hit rate` : '--'}
      />
      <StatTile label="Best run" value={stats.best ? <Multiple value={stats.best.maxMultiple} /> : '--'} sub={stats.best ? `$${stats.best.token.symbol} · ${SIGNAL_META[stats.best.kind].label}` : '--'} />
      <StatTile label="Warnings" hint="Dev and bundler sells" value={<span className={stats.bearish > 0 ? 'text-down' : undefined}>{stats.bearish}</span>} sub="dev / bundler sells" />
    </div>
  );
}

function Signals({ chain }: { chain: ChainId }) {
  const mobile = useIsMobile();
  const live = useSignals(chain);
  const [storedKinds, setKinds] = useLocalStorage<SignalKind[]>('ts.signals.kinds', []);
  const kinds = useMemo(() => (Array.isArray(storedKinds) ? storedKinds.filter((k) => k in SIGNAL_META) : []), [storedKinds]);
  const [hitsOnly, setHitsOnly] = useLocalStorage('ts.signals.hitsOnly', false);
  const [buyAmount, setBuyAmount] = useQuickBuyAmount(chain);
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const m = new Map<SignalKind, number>();
    for (const s of live.signals) m.set(s.kind, (m.get(s.kind) ?? 0) + 1);
    return m;
  }, [live.signals]);

  const filtered = useMemo(() => {
    const set = new Set(kinds);
    return live.signals.filter((s) => (set.size === 0 || set.has(s.kind)) && (!hitsOnly || s.maxMultiple >= 2));
  }, [live.signals, kinds, hitsOnly]);

  const toggle = (k: SignalKind) => {
    setLimit(PAGE);
    setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
  };
  const reset = () => {
    setKinds([]);
    setHitsOnly(false);
  };

  const headerActions = (
    <>
      <LiveStatus live={live.live} error={!!live.error} cadence="on trigger" />
      <QuickBuyAmount chain={chain} value={buyAmount} onChange={setBuyAmount} className={mobile ? 'ml-auto' : undefined} />
    </>
  );

  return (
    <Page className="flex max-w-[1800px] flex-col gap-3">
      <PageHeader
        className="!mb-0"
        title="Signals"
        icon={<Radio size={16} />}
        subtitle={`What smart money, KOLs and devs are doing on ${CHAINS[chain].name}, as it happens`}
        actions={mobile ? undefined : headerActions}
      />
      {mobile && <div className="flex items-center gap-2">{headerActions}</div>}

      {!live.error && <Summary signals={filtered} hitsOnly={hitsOnly} />}

      <div className="flex flex-col gap-2 md:flex-row md:items-start">
        <div className="no-scrollbar -mx-3 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Signal kinds">
          <KindChip kind={null} active={kinds.length === 0} count={live.signals.length} onClick={() => setKinds([])} />
          {SIGNAL_ORDER.map((k) => (
            <KindChip key={k} kind={k} active={kinds.includes(k)} count={counts.get(k) ?? 0} onClick={() => toggle(k)} />
          ))}
        </div>
        <Toggle size="sm" checked={hitsOnly} onChange={setHitsOnly} label="Only 2x+ hits" className="shrink-0 md:pt-1.5" />
      </div>

      {live.error ? (
        <div className="panel">
          <ErrorState error={live.error} onRetry={live.retry} retrying={live.retrying} />
        </div>
      ) : live.loading ? (
        <CardsSkeleton />
      ) : filtered.length === 0 ? (
        <div className="panel">
          {kinds.length > 0 || hitsOnly ? (
            <EmptyState
              icon={<Target size={18} />}
              title="No signals match"
              description="Nothing of the selected kinds has fired yet. New signals appear here live."
              action={
                <Button size="sm" variant="outline" icon={<RotateCcw size={13} />} onClick={reset}>
                  Show all signals
                </Button>
              }
            />
          ) : (
            <EmptyState icon={<Radio size={18} />} title="Waiting for signals" description="Signals fire when smart money, KOLs or devs act, or when a token spikes, migrates or prints a new high." />
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-live="off">
            {filtered.slice(0, limit).map((s) => (
              <SignalCard key={s.id} signal={s} buyAmount={buyAmount} fresh={live.freshIds.has(s.id)} />
            ))}
          </div>
          {filtered.length > limit && (
            <Button variant="outline" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({filtered.length - limit})
            </Button>
          )}
        </>
      )}
    </Page>
  );
}
