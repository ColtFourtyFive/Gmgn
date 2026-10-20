// Token facts: supply, pool or bonding curve, launchpad, timeline,
// description and links.

import { memo, useState, type ReactNode } from 'react';
import { formatDuration, formatPercent, shortAddress, type TokenDetail } from '@trenchscope/shared';
import { Info } from 'lucide-react';
import clsx from 'clsx';
import { Age, Compact, CurveProgress, LaunchpadBadge, Native, SocialLinks, Usd } from '@/components/common';
import { CopyButton, Heading, Panel } from '@/components/ui';

function Row({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-3 border-b border-line/60 py-0.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted" title={title}>
        {label}
      </dt>
      <dd className="num flex min-w-0 items-center justify-end gap-1 truncate text-right text-fg">{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Heading className="table-head mb-0.5 mt-2 first:mt-0">{title}</Heading>
      <dl>{children}</dl>
    </div>
  );
}

const dateFmt = (ts: number) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const TokenInfoPanel = memo(function TokenInfoPanel({ token: t, className }: { token: TokenDetail; className?: string }) {
  const [more, setMore] = useState(false);
  const pool = t.pool;
  const curve = t.curve;
  const growth = pool && pool.initialLiquidityUsd > 0 ? pool.liquidityUsd / pool.initialLiquidityUsd : null;
  return (
    <Panel className={className} title="Token info" icon={<Info size={14} />}>
      {t.description && (
        <div className="mb-2">
          <p className={clsx('text-sm text-muted', !more && 'line-clamp-3')}>{t.description}</p>
          {t.description.length > 140 && (
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => setMore((m) => !m)}>
              {more ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <SocialLinks socials={t.socials} size={15} />
        {t.xFollowers !== null && (
          <span className="text-xs text-muted">
            <Compact value={t.xFollowers} /> X followers
          </span>
        )}
      </div>

      <Group title="Supply">
        <Row label="Total supply">
          <Compact value={t.totalSupply} />
        </Row>
        <Row label="Circulating">
          <Compact value={t.circulatingSupply} />
        </Row>
        <Row label="Decimals">{t.decimals}</Row>
        <Row label="Contract">
          <span className="font-mono text-xs" title={t.address}>
            {shortAddress(t.address, 6, 6)}
          </span>
          <CopyButton text={t.address} label="Copy contract address" />
        </Row>
      </Group>

      {pool ? (
        <Group title="Pool">
          <Row label="DEX">{pool.dex}</Row>
          <Row label="Pool">
            <span className="font-mono text-xs" title={pool.address}>
              {shortAddress(pool.address, 4, 4)}
            </span>
            <CopyButton text={pool.address} label="Copy pool address" />
          </Row>
          <Row label="Liquidity">
            <Usd value={pool.liquidityUsd} />
          </Row>
          <Row label="Reserves">
            <Native value={pool.nativeReserve} chain={t.chain} /> <span className="text-faint">/</span> <Compact value={pool.tokenReserve} />
          </Row>
          <Row label="Initial liquidity">
            <Usd value={pool.initialLiquidityUsd} />
            {growth !== null && <span className={clsx('text-xs', growth >= 1 ? 'text-up' : 'text-down')}>({growth >= 10 ? Math.round(growth) : growth.toFixed(1)}×)</span>}
          </Row>
          <Row label="LP burned">
            <span className={pool.lpBurnedRate >= 0.99 ? 'text-up' : pool.lpBurnedRate < 0.5 ? 'text-down' : 'text-warn'}>{formatPercent(pool.lpBurnedRate, { sign: false, digits: 0 })}</span>
          </Row>
          <Row label="Swap fee">{formatPercent(pool.feeRate, { sign: false, digits: 2 })}</Row>
        </Group>
      ) : curve ? (
        <Group title="Bonding curve">
          <Row label="Progress">
            <CurveProgress progress={curve.progress} className="w-28" />
          </Row>
          <Row label="Raised">
            <Native value={curve.realNative} chain={t.chain} />
          </Row>
          <Row label="Tokens left">
            <Compact value={curve.realTokens} />
          </Row>
          <Row label="Graduates at" title="Market cap at which the curve completes and the token migrates">
            <Usd value={curve.graduationMarketCapUsd} /> MC
          </Row>
        </Group>
      ) : null}

      <Group title="Timeline">
        <Row label="Launchpad">
          <LaunchpadBadge launchpad={t.launchpad} />
        </Row>
        <Row label="Created">
          <span className="text-xs text-muted">{dateFmt(t.createdAt)}</span>
          <Age ts={t.createdAt} suffix=" ago" />
        </Row>
        {t.migratedAt && (
          <Row label="Migrated">
            <span className="text-xs text-muted">{dateFmt(t.migratedAt)}</span>
            <Age ts={t.migratedAt} suffix=" ago" />
          </Row>
        )}
        {t.completeCostSeconds !== null && <Row label="Curve filled in">{formatDuration(t.completeCostSeconds)}</Row>}
        <Row label="Initial liquidity">
          <Usd value={t.initialLiquidityUsd} />
        </Row>
        <Row label="Fees paid by traders">
          <Usd value={t.totalFeesUsd} />
        </Row>
      </Group>
    </Panel>
  );
});
