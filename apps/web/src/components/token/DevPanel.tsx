// Developer panel: creator wallet, current holding, launch history and funding.

import { memo, type ReactNode } from 'react';
import { formatPercent, type TokenDetail } from '@trenchscope/shared';
import { ChevronRight, Code } from 'lucide-react';
import clsx from 'clsx';
import { AddressLink, Usd } from '@/components/common';
import { devStatusMeta } from '@/components/discovery';
import { Badge, Panel } from '@/components/ui';

function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex min-w-0 flex-col', className)}>
      <dt className="text-2xs text-muted">{label}</dt>
      <dd className="num truncate text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

export const DevPanel = memo(function DevPanel({ token, onOpenTokens, className }: { token: TokenDetail; onOpenTokens: () => void; className?: string }) {
  const d = token.dev;
  const status = devStatusMeta(d.status);
  const tone = d.status === 'sold_all' ? 'info' : d.status === 'sold_part' ? 'warn' : d.status === 'bought_more' ? 'up' : 'neutral';
  return (
    <Panel
      className={className}
      title="Developer"
      icon={<Code size={14} />}
      actions={
        <Badge tone={tone} title={status.hint}>
          {status.label}
        </Badge>
      }
    >
      <div className="flex flex-col gap-2.5">
        <AddressLink chain={token.chain} address={d.address} avatar tags={['dev']} head={6} tail={4} />
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
          <Stat label="Holds">{formatPercent(d.holdRate, { sign: false, digits: 1 })}</Stat>
          <Stat label="Created">{d.createdCount}</Stat>
          <Stat label="Migrated">
            {d.migratedCount} <span className="text-xs font-normal text-muted">({formatPercent(d.migrationRate, { sign: false, digits: 0 })})</span>
          </Stat>
          <Stat label="Rugged">
            <span className={d.ruggedCount > 0 ? 'text-down' : undefined}>{d.ruggedCount}</span>
          </Stat>
          <Stat label="Best ATH" className="col-span-2">
            <Usd value={d.bestAthMarketCapUsd} />
          </Stat>
        </dl>
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">Funded by</span>
          {d.fundedBy ? <AddressLink chain={token.chain} address={d.fundedBy} avatar /> : <span className="text-faint">Unknown</span>}
        </div>
        <button type="button" onClick={onOpenTokens} className="btn-outline btn-sm w-full justify-between">
          <span>Dev tokens</span>
          <span className="flex items-center gap-1 text-muted">
            {d.tokens.length}
            <ChevronRight size={13} aria-hidden />
          </span>
        </button>
      </div>
    </Panel>
  );
});
