import { memo } from 'react';
import { Link } from 'react-router-dom';
import { formatInt, shortAddress, type ChainId } from '@trenchscope/shared';
import { Trophy } from 'lucide-react';
import clsx from 'clsx';
import { WalletAvatar, WalletTags } from '@/components/common';
import { EmptyState, Panel, Skeleton } from '@/components/ui';
import { HitRate, Multiple } from '@/components/wallet';
import { routes } from '@/lib/chain';
import type { CallerStats } from './callerStats';
import type { CallerDirectory } from './useCallouts';

const MEDAL = ['text-accent', 'text-muted', 'text-dev'];

export interface TopCallersPanelProps {
  chain: ChainId;
  callers: CallerStats[];
  directory: CallerDirectory;
  loading: boolean;
  /** Rows shown. */
  limit?: number;
  className?: string;
}

/** Callers ranked by hit rate over the loaded calls (2+ calls each). */
export const TopCallersPanel = memo(function TopCallersPanel({ chain, callers, directory, loading, limit = 12, className }: TopCallersPanelProps) {
  return (
    <Panel title="Top callers" subtitle="Hit rate over the calls listed (2+ calls)" icon={<Trophy size={14} />} padded={false} className={className} bodyClassName="min-h-0 overflow-y-auto">
      {loading ? (
        <ul className="flex flex-col gap-3 p-3" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-2">
              <Skeleton circle width={26} height={26} />
              <Skeleton className="h-3 flex-1" />
            </li>
          ))}
        </ul>
      ) : callers.length === 0 ? (
        <EmptyState compact icon={<Trophy size={16} />} title="No repeat callers yet" description="Callers show up here once they have two calls in the list." />
      ) : (
        <ol aria-label="Top callers">
          {callers.slice(0, limit).map((c, i) => {
            const info = directory(c.address);
            return (
              <li key={c.address} className="flex items-center gap-2 border-b border-line/60 px-3 py-2 last:border-b-0">
                <span className="flex w-5 shrink-0 justify-center">
                  {i < 3 ? <Trophy size={13} className={MEDAL[i]} aria-label={`Rank ${i + 1}`} /> : <span className="num text-xs text-faint">{i + 1}</span>}
                </span>
                <WalletAvatar seed={c.address} size={26} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex min-w-0 items-center gap-1">
                    <Link to={routes.wallet(chain, c.address)} title={c.address} className={clsx('link truncate', info?.label ? 'font-medium' : 'num font-mono text-xs')}>
                      {info?.label || shortAddress(c.address)}
                    </Link>
                    {info && info.tags.length > 0 && <WalletTags tags={info.tags} max={2} className="shrink-0 flex-nowrap" />}
                  </span>
                  <span className="num text-2xs text-muted">
                    {formatInt(c.hits)}/{formatInt(c.calls)} hits · best ${c.best.token.symbol} <Multiple value={c.best.maxMultiple} className="text-2xs" />
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end leading-tight">
                  <HitRate value={c.hitRate} />
                  <span className="text-2xs text-faint">
                    avg <Multiple value={c.avgMultiple} className="text-2xs" />
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
});
