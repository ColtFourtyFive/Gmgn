import type { ReactNode } from 'react';
import { getLaunchpad, type SecurityCheck, type TokenSummary, type WalletTag } from '@trenchscope/shared';
import { Layers } from 'lucide-react';
import { AddressLink, Age, Compact, CurveProgress, LaunchpadBadge, Pct, Price, SecurityChecksList, TokenAvatar, Usd } from '@/components/common';
import { Badge } from '@/components/ui';
import { devStatusMeta, TagCount } from './TokenBadges';

const LEVEL_ORDER: Record<SecurityCheck['level'], number> = { bad: 0, warn: 1, good: 2, info: 3 };

/** Most important audit lines first: risks, then warnings, then passes. */
function topChecks(checks: SecurityCheck[], n: number): SecurityCheck[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => LEVEL_ORDER[a.c.level] - LEVEL_ORDER[b.c.level] || a.i - b.i)
    .slice(0, n)
    .map((x) => x.c);
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-2xs uppercase tracking-wide text-faint">{label}</span>
      <span className="num truncate text-sm font-medium text-fg">{children}</span>
    </div>
  );
}

export interface TokenHoverSummaryProps {
  token: TokenSummary;
  /** Viewer-relative tags for the creator ('you' / 'following'). */
  devTags?: WalletTag[];
}

/** Mini token summary for hover cards: price & changes, key stats, dev, narrative, top audit lines. */
export function TokenHoverSummary({ token: t, devTags = [] }: TokenHoverSummaryProps) {
  const dev = devStatusMeta(t.security.devStatus);
  const lp = getLaunchpad(t.launchpad);
  const curve = t.status !== 'migrated';
  return (
    <div className="flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-2.5 text-sm">
      <div className="flex items-center gap-2.5">
        <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} size={40} progress={curve ? t.progress : undefined} launchpadColor={lp?.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-fg">{t.symbol}</span>
            <LaunchpadBadge launchpad={t.launchpad} />
          </div>
          <p className="truncate text-xs text-muted">{t.name}</p>
        </div>
        <div className="flex flex-col items-end">
          <Price value={t.priceUsd} className="font-semibold text-fg" />
          <Age ts={t.createdAt} suffix=" old" className="text-2xs text-faint" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded bg-panel-2 px-2 py-1.5">
        {(['5m', '1h', '24h'] as const).map((w) => (
          <div key={w} className="flex flex-col items-center">
            <span className="text-2xs uppercase text-faint">{w}</span>
            <Pct value={t.stats[w].priceChange} digits={1} className="text-sm font-medium" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
        <Stat label="MC">
          <Usd value={t.marketCapUsd} />
        </Stat>
        <Stat label="ATH MC">
          <Usd value={t.athMarketCapUsd} />
        </Stat>
        <Stat label="Liq">
          <Usd value={t.liquidityUsd} />
        </Stat>
        <Stat label="Vol 1h">
          <Usd value={t.stats['1h'].volumeUsd} />
        </Stat>
        <Stat label="Net buy 24h">
          <Usd value={t.netBuy24hUsd} colored signed />
        </Stat>
        <Stat label="Holders">
          <Compact value={t.holderCount} />
        </Stat>
      </div>

      {curve ? (
        <CurveProgress progress={t.progress} size="md" />
      ) : (
        <p className="text-xs text-muted">
          Migrated to <span className="text-fg">{t.dex ?? 'DEX'}</span> <Age ts={t.migratedAt} suffix=" ago" />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {t.narrative && (
          <Badge tone="accent" icon={<Layers size={10} aria-hidden />}>
            {t.narrative}
          </Badge>
        )}
        <TagCount tag="smart" count={t.smartDegenCount} />
        <TagCount tag="kol" count={t.kolCount} />
        <TagCount tag="sniper" count={t.holderTags.sniperCount} />
        <TagCount tag="insider" count={t.holderTags.insiderCount} />
        <TagCount tag="bundler" count={t.holderTags.bundlerCount} />
      </div>

      <div className="flex flex-col gap-1 border-t border-line pt-2">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-faint">Dev</span>
          <AddressLink chain={t.chain} address={t.creator} tags={['dev', ...devTags]} />
          <span className={`ml-auto shrink-0 ${dev.className}`} title={dev.hint}>
            {dev.label}
          </span>
        </div>
        <p className="text-xs text-muted">
          <span className="num text-fg">{t.devCreatedCount}</span> launched · <span className="num text-fg">{t.devMigratedCount}</span> migrated
        </p>
      </div>

      {t.security.checks.length > 0 && <SecurityChecksList checks={topChecks(t.security.checks, 5)} className="border-t border-line pt-1" />}
    </div>
  );
}
