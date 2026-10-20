import { CHAIN_IDS, CHAINS, formatNative, type ChainMarketInfo, type CongestionLabel } from '@trenchscope/shared';
import { Activity, Wallet, Zap, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ChainIcon, Pct, SimBanner, Usd } from '@/components/common';
import { Tooltip } from '@/components/ui';
import { useMeta } from '@/hooks/useMeta';
import { useNow } from '@/hooks/useNow';
import { realtime, useChannelState, useConnectionState, type ConnectionState } from '@/lib/ws';
import { toggleDockTab, useDock, type DockTab } from '@/store/dock';

const CONN: Record<ConnectionState, { label: string; dot: string }> = {
  open: { label: 'Live', dot: 'bg-up' },
  connecting: { label: 'Connecting', dot: 'bg-warn animate-pulse2' },
  closed: { label: 'Offline', dot: 'bg-down' },
};

const LOAD: Record<CongestionLabel, { label: string; dot: string; text: string }> = {
  normal: { label: 'Normal', dot: 'bg-up', text: 'text-up' },
  busy: { label: 'Busy', dot: 'bg-warn', text: 'text-warn' },
  congested: { label: 'Congested', dot: 'bg-down animate-pulse2', text: 'text-down' },
};

/** Network load of one chain: a dot (with the label once busy) coloured by congestion; fee suggestions on hover. */
function Congestion({ market: m }: { market: ChainMarketInfo }) {
  const c = m.congestion;
  if (!c) return null;
  const load = LOAD[c.label];
  const symbol = CHAINS[m.chain].nativeSymbol;
  return (
    <Tooltip content={`${CHAINS[m.chain].name} network: ${load.label.toLowerCase()} (load ${Math.round(c.level * 100)}%). Suggested priority fee ${formatNative(m.priorityFee.medium, symbol)} (low ${formatNative(m.priorityFee.low)}, fast ${formatNative(m.priorityFee.high)}).`}>
      <span className={clsx('flex items-center gap-1 text-2xs', load.text)} tabIndex={0} aria-label={`${CHAINS[m.chain].name} network ${load.label}`}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', load.dot)} aria-hidden />
        {c.label !== 'normal' && <span className="hidden xl:inline">{load.label}</span>}
      </span>
    </Tooltip>
  );
}

function Divider({ className }: { className?: string }) {
  return <span aria-hidden className={clsx('h-3 w-px bg-line', className)} />;
}

const DOCK_TOGGLES: { tab: DockTab; label: string; icon: LucideIcon }[] = [
  { tab: 'positions', label: 'Positions', icon: Wallet },
  { tab: 'trade', label: 'Instant trade', icon: Zap },
];

/** Dock toggles (SH-10): open the floating dock on a panel, or close it when that panel shows. */
function DockToggles({ className }: { className?: string }) {
  const shown = useDock((s) => (s.open && !s.collapsed ? s.tab : null));
  return (
    <div role="group" aria-label="Dock panels" className={clsx('flex items-center gap-1', className)}>
      {DOCK_TOGGLES.map(({ tab, label, icon: Icon }) => (
        <button
          key={tab}
          type="button"
          aria-pressed={shown === tab}
          aria-label={label}
          title={label}
          onClick={() => toggleDockTab(tab)}
          className={clsx(
            'flex h-5 items-center gap-1 rounded px-1.5 transition-colors hover:bg-panel-3 hover:text-fg',
            shown === tab ? 'bg-panel-3 text-fg' : 'text-muted',
          )}
        >
          <Icon size={12} aria-hidden className={shown === tab ? 'text-accent' : undefined} />
          <span className="hidden lg:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Desktop footer: realtime connection + latency, native prices and network load, sim throughput (≥lg), dock toggles. */
export function StatusBar({ className }: { className?: string }) {
  const conn = useConnectionState();
  useNow(); // re-read the (non-reactive) ping latency every second
  const latency = realtime.latency;
  const live = useChannelState<ChainMarketInfo[]>('market', 'market');
  const meta = useMeta().data;
  const markets = live ?? meta?.chains ?? [];
  const tps = meta?.sim.tradesPerSecond;

  return (
    <footer className={clsx('h-7 shrink-0 items-center gap-3 border-t border-line bg-panel px-3 text-xs text-muted', className)}>
      <Tooltip content={conn === 'open' ? 'Realtime feed connected (round-trip latency)' : 'Realtime feed disconnected — reconnecting automatically'}>
        <span className="flex items-center gap-1.5" tabIndex={0}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', CONN[conn].dot)} />
          <span className="text-fg">{CONN[conn].label}</span>
          {conn === 'open' && latency !== null && <span className="num">{latency}ms</span>}
        </span>
      </Tooltip>
      <Divider />
      <ul className="flex items-center gap-3" aria-label="Native asset prices and network load">
        {CHAIN_IDS.map((c) => {
          const m = markets.find((x) => x.chain === c);
          return (
            <li key={c} className="flex items-center gap-1">
              <ChainIcon chain={c} size={12} />
              <Usd value={m?.nativeUsd} className="text-fg" />
              {m && <Pct value={m.nativeChange24h} digits={1} className="text-2xs" />}
              {m && <Congestion market={m} />}
            </li>
          );
        })}
      </ul>
      <Divider className="hidden lg:block" />
      <span className="hidden items-center gap-1 lg:flex">
        <Activity size={12} aria-hidden />
        <span className="num text-fg">{tps === undefined ? '--' : tps.toFixed(1)}</span> trades/s
      </span>
      <DockToggles className="mx-auto" />
      <SimBanner />
    </footer>
  );
}
