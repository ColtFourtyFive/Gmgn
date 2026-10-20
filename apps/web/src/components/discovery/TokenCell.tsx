import { memo } from 'react';
import { Link } from 'react-router-dom';
import { formatPercent, getLaunchpad, type TokenSummary, type WalletTag } from '@trenchscope/shared';
import { Check, Flame, X } from 'lucide-react';
import clsx from 'clsx';
import { Age, LaunchpadBadge, SocialLinks, TokenAvatar } from '@/components/common';
import { CopyButton, HoverCard, Tooltip } from '@/components/ui';
import { routes } from '@/lib/chain';
import { TokenFlags } from './TokenBadges';
import { TokenHoverSummary } from './TokenHoverSummary';

export interface TokenCellProps {
  token: TokenSummary;
  /** 1-based rank shown before the avatar. */
  rank?: number;
  /** Age shown on the second line (defaults to creation time). */
  ageTs?: number | null;
  devTags?: WalletTag[];
  /** Phone layout: smaller avatar, no name/copy/socials/flags. */
  dense?: boolean;
  /** Launchpad name chip on the second line. */
  showLaunchpad?: boolean;
}

/** Token identity cell for discovery tables: rank, avatar (hover summary), symbol, name, age, socials, flags. */
export const TokenCell = memo(function TokenCell({ token: t, rank, ageTs, devTags, dense, showLaunchpad }: TokenCellProps) {
  const lp = getLaunchpad(t.launchpad);
  const curve = t.status !== 'migrated';
  return (
    <div className="flex min-w-0 items-center gap-2">
      {rank !== undefined && <span className={clsx('num shrink-0 text-right text-xs text-faint', dense ? 'w-4' : 'w-5')}>{rank}</span>}
      <HoverCard
        placement="right-start"
        aria-label={`${t.symbol} summary`}
        trigger={
          <span className="block rounded-full">
            <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} size={dense ? 28 : 32} progress={curve ? t.progress : undefined} launchpadColor={lp?.color} title={lp?.name} />
          </span>
        }
      >
        <TokenHoverSummary token={t} devTags={devTags} />
      </HoverCard>
      <div className="flex min-w-0 flex-col leading-tight">
        <div className="flex min-w-0 items-center gap-1">
          <Link to={routes.token(t.chain, t.address)} className="link truncate font-semibold" title={`${t.symbol} — ${t.name}`}>
            {t.symbol}
          </Link>
          {!dense && (
            <>
              <span className="min-w-0 truncate text-xs text-muted">{t.name}</span>
              <CopyButton text={t.address} label="Copy contract address" size={11} />
            </>
          )}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs">
          <Age ts={ageTs ?? t.createdAt} className="shrink-0 text-up" />
          {!dense && (
            <>
              {showLaunchpad && <LaunchpadBadge launchpad={t.launchpad} className="shrink-0" />}
              <SocialLinks socials={t.socials} size={11} className="shrink-0" />
              <TokenFlags token={t} followedDev={devTags?.includes('following')} className="min-w-0 overflow-hidden" />
            </>
          )}
        </div>
      </div>
    </div>
  );
});

function Mark({ ok, label, hint }: { ok: boolean | null; label: string; hint: string }) {
  const Icon = ok === null ? null : ok ? Check : X;
  return (
    <Tooltip content={`${hint}: ${ok === null ? 'n/a' : ok ? 'yes' : 'no'}`}>
      <span
        className={clsx('chip !gap-0.5 !px-1', ok === null ? 'bg-panel-3 text-faint' : ok ? 'bg-up/10 text-up' : 'bg-down/15 text-down')}
        aria-label={`${hint}: ${ok === null ? 'not applicable' : ok ? 'yes' : 'no'}`}
      >
        {Icon && <Icon size={10} strokeWidth={3} aria-hidden />}
        {label}
      </span>
    </Tooltip>
  );
}

/** Compact audit summary: authority/contract checks per chain family, LP burn and top-10 share. */
export const SecuritySummary = memo(function SecuritySummary({ token: t, top10Threshold }: { token: TokenSummary; top10Threshold: number }) {
  const s = t.security;
  const sol = t.chain === 'sol';
  const lp = s.lpBurnedRate;
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {sol ? (
        <>
          <Mark ok={s.renouncedMint} label="Mint" hint="Mint authority revoked" />
          <Mark ok={s.renouncedFreeze} label="Frz" hint="Freeze authority revoked" />
        </>
      ) : (
        <>
          <Mark ok={s.isHoneypot === null ? null : !s.isHoneypot} label="HP" hint="Not a honeypot" />
          <Mark ok={s.isOpenSource} label="Src" hint="Contract verified" />
          <Mark ok={s.isRenounced} label="Own" hint="Ownership renounced" />
        </>
      )}
      <Tooltip content={lp === null ? 'LP burn: n/a (on curve)' : `LP burned: ${formatPercent(lp, { sign: false, digits: 0 })}`}>
        <span className={clsx('chip num !px-1', lp === null ? 'bg-panel-3 text-faint' : lp >= 0.99 ? 'bg-up/10 text-up' : 'bg-warn/15 text-warn')}>
          <Flame size={10} aria-hidden />
          {lp === null ? '--' : formatPercent(lp, { sign: false, digits: 0 })}
        </span>
      </Tooltip>
      <Tooltip content={`Top 10 holders: ${formatPercent(s.top10HolderRate, { sign: false, digits: 1 })}`}>
        <span className={clsx('chip num !px-1', s.top10HolderRate > top10Threshold ? 'bg-down/15 text-down' : 'bg-up/10 text-up')}>
          T10 {formatPercent(s.top10HolderRate, { sign: false, digits: 0 })}
        </span>
      </Tooltip>
    </span>
  );
});
