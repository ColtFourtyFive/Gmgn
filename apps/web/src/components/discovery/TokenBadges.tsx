// Small token-level indicators shared by the discovery surfaces: tagged
// holder counts, dev status, marketing/risk badges and the risk-chip row.

import { memo, type ReactNode } from 'react';
import { formatPercent, type DevStatus, type DisplaySettings, type TokenSummary, type WalletTag } from '@trenchscope/shared';
import { Boxes, Code, Copy, Crosshair, Crown, Flame, Rocket, ShieldAlert, Sprout, Star, Users, VenetianMask, Waves } from 'lucide-react';
import clsx from 'clsx';
import { RiskChip, WALLET_TAG_META } from '@/components/common';
import { Tooltip } from '@/components/ui';

/** Fresh-wallet share above which the Fresh chip turns red (no user setting exists for it). */
export const FRESH_THRESHOLD = 0.3;

export interface TagCountProps {
  tag: WalletTag;
  count: number;
  /** Hide when zero (default true). */
  hideZero?: boolean;
  className?: string;
}

/** Wallet-tag icon + holder count ("🧠 3"), colored like the tag. */
export const TagCount = memo(function TagCount({ tag, count, hideZero = true, className }: TagCountProps) {
  if (hideZero && !count) return null;
  const meta = WALLET_TAG_META[tag];
  const Icon = meta.icon;
  return (
    <Tooltip content={`${count} ${meta.label.toLowerCase()} holder${count === 1 ? '' : 's'} — ${meta.description}`}>
      <span
        className={clsx('chip num !px-1', !count && 'opacity-50', className)}
        style={{ color: `rgb(var(--${meta.token}))`, backgroundColor: `rgb(var(--${meta.token}) / 0.12)` }}
        aria-label={`${count} ${meta.label}`}
      >
        <Icon size={11} strokeWidth={2.25} aria-hidden />
        {count}
      </span>
    </Tooltip>
  );
});

const DEV_STATUS: Record<DevStatus, { label: string; short: string; className: string; hint: string }> = {
  hold: { label: 'Holding', short: 'DH', className: 'text-muted', hint: 'The dev still holds their tokens.' },
  sold_part: { label: 'Sold part', short: 'DSP', className: 'text-warn', hint: 'The dev sold part of their tokens.' },
  sold_all: { label: 'Sold all', short: 'DS', className: 'text-info', hint: 'The dev sold everything — no dev supply left to dump.' },
  bought_more: { label: 'Bought more', short: 'DB', className: 'text-up', hint: 'The dev bought more after launch.' },
};

export function devStatusMeta(status: DevStatus) {
  return DEV_STATUS[status];
}

/** Dev hold chip: "DS" badge once the dev sold everything, else the dev's share vs. the threshold. */
export const DevChip = memo(function DevChip({ status, holdRate, threshold, className }: { status: DevStatus; holdRate: number; threshold: number; className?: string }) {
  if (status === 'sold_all') {
    return (
      <Tooltip content={DEV_STATUS.sold_all.hint}>
        <span className="chip bg-info/15 text-info" aria-label="Dev sold all">
          <Code size={10} aria-hidden />
          DS
        </span>
      </Tooltip>
    );
  }
  return (
    <RiskChip
      label="Dev"
      className={className}
      value={holdRate}
      threshold={threshold}
      icon={<Code size={10} aria-hidden />}
      hint={`Dev holds ${formatPercent(holdRate, { sign: false, digits: 1 })} of supply (${DEV_STATUS[status].label.toLowerCase()}). Red above ${formatPercent(threshold, { sign: false, digits: 0 })}.`}
    />
  );
});

function pct(v: number): string {
  return formatPercent(v, { sign: false, digits: 0 });
}

/**
 * RiskChip renders "<icon> <label> <value>"; on dense cards the icon carries
 * the meaning, so the text label is kept for screen readers and tooltips only.
 */
const ICON_ONLY = '[&>.opacity-80]:sr-only';

/** Top10 / Dev / Insiders / Snipers / Bundlers / Fresh chips, red past the viewer's thresholds. */
export const RiskChips = memo(function RiskChips({
  token,
  thresholds,
  iconOnly = true,
  className,
}: {
  token: TokenSummary;
  thresholds: DisplaySettings['riskThresholds'];
  /** Hide the text labels (icons + values only). */
  iconOnly?: boolean;
  className?: string;
}) {
  const s = token.security;
  const chip = iconOnly ? ICON_ONLY : undefined;
  return (
    <span className={clsx('flex flex-wrap items-center gap-x-0.5 gap-y-1 sm:gap-1', className)}>
      <RiskChip label="Top 10" className={chip} value={s.top10HolderRate} threshold={thresholds.top10} icon={<Crown size={10} aria-hidden />} hint={`Top 10 holders own this share of supply. Red above ${pct(thresholds.top10)}.`} />
      <DevChip status={s.devStatus} holdRate={s.devHoldRate} threshold={thresholds.dev} className={chip} />
      <RiskChip label="Insiders" className={chip} value={s.insiderHoldRate} threshold={thresholds.insiders} icon={<VenetianMask size={10} aria-hidden />} hint={`Insiders (dev-linked wallets) hold this share. Red above ${pct(thresholds.insiders)}.`} />
      <RiskChip label="Snipers" className={chip} value={s.sniperHoldRate} threshold={thresholds.snipers} icon={<Crosshair size={10} aria-hidden />} hint={`Snipers (first-block buyers) hold this share. Red above ${pct(thresholds.snipers)}.`} />
      <RiskChip label="Bundlers" className={chip} value={s.bundlerRate} threshold={thresholds.bundlers} icon={<Boxes size={10} aria-hidden />} hint={`Share of volume from bundler wallets. Red above ${pct(thresholds.bundlers)}.`} />
      <RiskChip label="Fresh" className={chip} value={s.freshWalletRate} threshold={FRESH_THRESHOLD} icon={<Sprout size={10} aria-hidden />} hint={`Share of holders that are fresh wallets. Red above ${pct(FRESH_THRESHOLD)}.`} />
    </span>
  );
});

function Flag({ tone, icon, children, hint }: { tone: string; icon?: ReactNode; children?: ReactNode; hint: string }) {
  return (
    <Tooltip content={hint}>
      <span className={clsx('chip !px-1', tone)} aria-label={hint}>
        {icon}
        {children}
      </span>
    </Tooltip>
  );
}

export interface TokenFlagsProps {
  token: TokenSummary;
  /** The creator is a wallet the viewer follows. */
  followedDev?: boolean;
  className?: string;
}

/** CTO, boosted, copycat, honeypot/tax (EVM), LP burnt, wash-trading and followed-dev badges. */
export const TokenFlags = memo(function TokenFlags({ token: t, followedDev, className }: TokenFlagsProps) {
  const s = t.security;
  const tax = Math.max(s.buyTax, s.sellTax);
  const items: ReactNode[] = [];
  if (s.isHoneypot) items.push(<Flag key="hp" tone="bg-down/15 text-down" icon={<ShieldAlert size={10} aria-hidden />} hint="Honeypot — buys work, sells fail">HP</Flag>);
  else if (tax > 0) items.push(<Flag key="tax" tone="bg-warn/15 text-warn" hint={`Buy tax ${pct(s.buyTax)} · sell tax ${pct(s.sellTax)}`}>Tax {pct(tax)}</Flag>);
  if (s.isWashTrading) items.push(<Flag key="wash" tone="bg-down/15 text-down" icon={<Waves size={10} aria-hidden />} hint="Wash trading detected">Wash</Flag>);
  if (t.isCopycat) items.push(<Flag key="copy" tone="bg-warn/15 text-warn" icon={<Copy size={10} aria-hidden />} hint="Copycat — reuses an earlier token’s name or image" />);
  if (t.cto) items.push(<Flag key="cto" tone="bg-info/15 text-info" hint="Community takeover">CTO</Flag>);
  if (t.boosted) items.push(<Flag key="boost" tone="bg-accent/15 text-accent" icon={<Rocket size={10} aria-hidden />} hint="Boosted — paid promotion" />);
  if (s.lpBurnedRate !== null && s.lpBurnedRate >= 0.99) items.push(<Flag key="lp" tone="bg-up/15 text-up" icon={<Flame size={10} aria-hidden />} hint="LP burned — liquidity can’t be pulled" />);
  if (followedDev) items.push(<Flag key="fdev" tone="bg-info/15 text-info" icon={<Star size={10} aria-hidden />} hint="Created by a wallet you follow" />);
  if (items.length === 0) return null;
  return <span className={clsx('flex shrink-0 items-center gap-0.5', className)}>{items}</span>;
});

/** Holder count with icon, for dense metric lines. */
export function HolderCount({ count, className }: { count: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-0.5', className)} title="Holders">
      <Users size={11} className="text-faint" aria-hidden />
      {count}
    </span>
  );
}

/** Buy/sell split bar: green share = buys. */
export const BuySellBar = memo(function BuySellBar({ buys, sells, className }: { buys: number; sells: number; className?: string }) {
  const total = buys + sells;
  const share = total > 0 ? buys / total : 0.5;
  return (
    <span
      className={clsx('flex h-1 w-full min-w-[40px] overflow-hidden rounded-full bg-down/70', !total && 'opacity-30', className)}
      role="img"
      aria-label={`${buys} buys, ${sells} sells`}
      title={`${buys} buys / ${sells} sells`}
    >
      <span className="h-full bg-up" style={{ width: `${share * 100}%` }} />
    </span>
  );
});
