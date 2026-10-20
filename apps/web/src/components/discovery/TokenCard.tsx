import { memo, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, formatPercent, getLaunchpad, type DisplaySettings, type TokenSummary, type TrenchesColumn, type WalletTag } from '@trenchscope/shared';
import { Check } from 'lucide-react';
import clsx from 'clsx';
import { Age, Compact, FlashValue, SocialLinks, TokenAvatar, Usd } from '@/components/common';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import { CopyButton, HoverCard } from '@/components/ui';
import { useOpenLink } from '@/hooks/useOpenLink';
import { routes } from '@/lib/chain';
import { contextPoint, TokenContextMenu, type ContextPoint } from './HideActions';
import { HolderCount, RiskChips, TagCount, TokenFlags } from './TokenBadges';
import { TokenHoverSummary } from './TokenHoverSummary';

const INTERACTIVE = 'a,button,input,select,textarea,label,[role="button"],[data-row-ignore]';

export interface TokenCardProps {
  token: TokenSummary;
  column: TrenchesColumn;
  thresholds: DisplaySettings['riskThresholds'];
  /** Native amount for the quick-buy button. */
  buyAmount: number;
  /** Keyboard selection highlight. */
  selected?: boolean;
  /** Play the slide-in animation when mounted (new arrivals). */
  animate?: boolean;
  compact?: boolean;
  /** Viewer-relative tags of the creator ('you' / 'following'). */
  devTags?: WalletTag[];
}

function Metric({ label, children, title }: { label: string; children: ReactNode; title?: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap" title={title}>
      <span className="text-faint">{label}</span>
      <span className="font-medium text-fg">{children}</span>
    </span>
  );
}

/**
 * Dense Trenches card: avatar with curve ring + launchpad dot (hover for a
 * summary), symbol/name/CA, live age, socials, MC/volume/TX/holders, smart &
 * KOL counts, badges, safety score, risk chips and an instant-buy button.
 * Clicking anywhere that is not a control opens the token page; right-click
 * opens the actions menu (new tab, copy, hide token / dev).
 */
export const TokenCard = memo(function TokenCard({ token: t, column, thresholds, buyAmount, selected, animate, compact, devTags }: TokenCardProps) {
  const openLink = useOpenLink();
  const [entering, setEntering] = useState(!!animate);
  const [menuAt, setMenuAt] = useState<ContextPoint | null>(null);
  const curve = t.status !== 'migrated';
  const lp = getLaunchpad(t.launchpad);
  const href = routes.token(t.chain, t.address);
  const day = t.stats['24h'];

  const onClick = (e: MouseEvent<HTMLElement>) => {
    // Clicks inside portaled layers (hover card, dialogs) bubble here through React; they are not card clicks.
    if (!e.currentTarget.contains(e.target as Node)) return;
    const hit = (e.target as HTMLElement).closest(INTERACTIVE);
    if (hit && e.currentTarget.contains(hit)) return;
    openLink(href, e);
  };

  return (
    <>
      <li
        data-token={t.address}
        aria-current={selected || undefined}
        onClick={onClick}
        // Middle click opens the token in a new tab, like Ctrl/Cmd-click.
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
        onAuxClick={(e) => e.button === 1 && onClick(e)}
        onContextMenu={(e) => {
          if (!e.currentTarget.contains(e.target as Node)) return;
          e.preventDefault();
          setMenuAt(contextPoint(e));
        }}
        onAnimationEnd={() => setEntering(false)}
        className={clsx(
          'relative flex cursor-pointer gap-2.5 border-b border-line/70 px-2.5 transition-colors last:border-b-0 hover:bg-panel-2',
          compact ? 'py-1.5' : 'py-2',
          selected && 'bg-panel-2 shadow-[inset_2px_0_0_rgb(var(--accent))]',
          entering && 'animate-slide-in',
        )}
      >
        <div className={clsx('flex shrink-0 flex-col items-center gap-1', compact ? 'w-10' : 'w-12')}>
          <HoverCard
            placement="right-start"
            aria-label={`${t.symbol} summary`}
            trigger={
              <span className="block rounded-full">
                <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} size={compact ? 40 : 48} progress={curve ? t.progress : undefined} launchpadColor={lp?.color} title={lp?.name} />
              </span>
            }
          >
            <TokenHoverSummary token={t} devTags={devTags} />
          </HoverCard>
          {curve ? (
            <span className={clsx('num text-2xs font-medium', t.progress >= 0.8 ? 'text-accent' : 'text-muted')} title="Bonding curve progress">
              {formatPercent(t.progress, { sign: false, digits: 0 })}
            </span>
          ) : (
            <span className="num inline-flex items-center gap-0.5 text-2xs text-up" title={`Bonded in ${formatDuration(t.completeCostSeconds)} · trading on ${t.dex ?? 'DEX'}`}>
              <Check size={10} strokeWidth={3} aria-hidden />
              {formatDuration(t.completeCostSeconds)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <Link to={href} className="link shrink-0 truncate text-md font-semibold leading-5" title={t.symbol}>
              {t.symbol}
            </Link>
            <span className="min-w-0 truncate text-xs text-muted" title={t.name}>
              {t.name}
            </span>
            <CopyButton text={t.address} label="Copy contract address" size={11} />
            <span className="ml-auto shrink-0 pl-1 text-sm">
              <span className="text-faint">MC </span>
              <FlashValue value={t.marketCapUsd}>
                <Usd value={t.marketCapUsd} className="font-semibold text-fg" />
              </FlashValue>
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <Age ts={column === 'migrated' && t.migratedAt ? t.migratedAt : t.createdAt} className={clsx('shrink-0 font-medium', column === 'migrated' ? 'text-info' : 'text-up')} />
            <SocialLinks socials={t.socials} size={12} className="shrink-0" />
            {t.xFollowers !== null && t.xFollowers > 0 && (
              <span className="shrink-0 text-faint" title="X followers">
                <Compact value={t.xFollowers} digits={1} />
              </span>
            )}
            <TokenFlags token={t} followedDev={devTags?.includes('following')} className="min-w-0 overflow-hidden" />
            <span className="ml-auto shrink-0 pl-1">
              <span className="text-faint">V </span>
              <FlashValue value={day.volumeUsd}>
                <Usd value={day.volumeUsd} className="font-medium text-fg" />
              </FlashValue>
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <Metric label="TX" title={`${day.buys} buys / ${day.sells} sells (24h)`}>
                <FlashValue value={day.swaps}>
                  <Compact value={day.swaps} digits={1} />
                </FlashValue>
              </Metric>
              <HolderCount
                count={
                  <FlashValue value={t.holderCount}>
                    <Compact value={t.holderCount} digits={1} className="font-medium text-fg" />
                  </FlashValue>
                }
              />
              {column === 'migrated' && (
                <Metric label="Liq">
                  <Usd value={t.liquidityUsd} />
                </Metric>
              )}
              <span className="flex shrink-0 items-center gap-0.5">
                <TagCount tag="smart" count={t.smartDegenCount} />
                <TagCount tag="kol" count={t.kolCount} />
              </span>
            </div>
            <QuickBuyButton chain={t.chain} token={t.address} symbol={t.symbol} amount={buyAmount} className="-my-0.5 shrink-0" />
          </div>

          <RiskChips token={t} thresholds={thresholds} className="mt-0.5 min-w-0" />
        </div>
      </li>
      {menuAt && <TokenContextMenu token={t} at={menuAt} onClose={() => setMenuAt(null)} />}
    </>
  );
}, sameCard);

/** Re-render only when something the card shows changed (snapshots replace every object each second). */
function sameCard(a: TokenCardProps, b: TokenCardProps): boolean {
  if (a.column !== b.column || a.thresholds !== b.thresholds || a.buyAmount !== b.buyAmount || a.selected !== b.selected || a.compact !== b.compact) return false;
  if ((a.devTags ?? []).join() !== (b.devTags ?? []).join()) return false;
  const x = a.token;
  const y = b.token;
  if (x === y) return true;
  const sx = x.security;
  const sy = y.security;
  return (
    x.address === y.address &&
    x.priceUsd === y.priceUsd &&
    x.marketCapUsd === y.marketCapUsd &&
    x.liquidityUsd === y.liquidityUsd &&
    x.progress === y.progress &&
    x.status === y.status &&
    x.holderCount === y.holderCount &&
    x.stats['24h'].volumeUsd === y.stats['24h'].volumeUsd &&
    x.stats['24h'].swaps === y.stats['24h'].swaps &&
    x.stats['5m'].priceChange === y.stats['5m'].priceChange &&
    x.smartDegenCount === y.smartDegenCount &&
    x.kolCount === y.kolCount &&
    x.xFollowers === y.xFollowers &&
    x.cto === y.cto &&
    x.boosted === y.boosted &&
    x.migratedAt === y.migratedAt &&
    sx.top10HolderRate === sy.top10HolderRate &&
    sx.devHoldRate === sy.devHoldRate &&
    sx.devStatus === sy.devStatus &&
    sx.insiderHoldRate === sy.insiderHoldRate &&
    sx.sniperHoldRate === sy.sniperHoldRate &&
    sx.bundlerRate === sy.bundlerRate &&
    sx.freshWalletRate === sy.freshWalletRate &&
    sx.isWashTrading === sy.isWashTrading &&
    sx.lpBurnedRate === sy.lpBurnedRate &&
    sx.isHoneypot === sy.isHoneypot &&
    sx.safety?.score === sy.safety?.score &&
    sx.safety?.band === sy.safety?.band &&
    JSON.stringify(x.socials) === JSON.stringify(y.socials)
  );
}
