import { CHAIN_IDS, type ChainMarketInfo } from '@trenchscope/shared';
import { Activity } from 'lucide-react';
import clsx from 'clsx';
import { ChainIcon, Pct, SimBanner, Usd } from '@/components/common';
import { Tooltip } from '@/components/ui';
import { useMeta } from '@/hooks/useMeta';
import { useNow } from '@/hooks/useNow';
import { realtime, useChannelState, useConnectionState, type ConnectionState } from '@/lib/ws';

const CONN: Record<ConnectionState, { label: string; dot: string }> = {
  open: { label: 'Live', dot: 'bg-up' },
  connecting: { label: 'Connecting', dot: 'bg-warn animate-pulse2' },
  closed: { label: 'Offline', dot: 'bg-down' },
};

function Divider() {
  return <span aria-hidden className="h-3 w-px bg-line" />;
}

/** Desktop footer: realtime connection + latency, native prices, sim throughput. */
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
      <ul className="flex items-center gap-3" aria-label="Native asset prices">
        {CHAIN_IDS.map((c) => {
          const m = markets.find((x) => x.chain === c);
          return (
            <li key={c} className="flex items-center gap-1">
              <ChainIcon chain={c} size={12} />
              <Usd value={m?.nativeUsd} className="text-fg" />
              {m && <Pct value={m.nativeChange24h} digits={1} className="text-2xs" />}
            </li>
          );
        })}
      </ul>
      <Divider />
      <span className="flex items-center gap-1">
        <Activity size={12} aria-hidden />
        <span className="num text-fg">{tps === undefined ? '--' : tps.toFixed(1)}</span> trades/s
      </span>
      <SimBanner className="ml-auto" />
    </footer>
  );
}
