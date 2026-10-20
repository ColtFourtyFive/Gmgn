import { formatPercent, formatUsd, type AlertKind, type HoldingAlertSpec, type NotificationKind, type SignalFilterGroup } from '@trenchscope/shared';
import { Activity, BellRing, Brain, BriefcaseBusiness, CircleCheck, CircleDollarSign, CircleX, Crosshair, Info, Percent, Radio, Repeat2, Rocket, Star, UserRound, type LucideIcon } from 'lucide-react';
import { SIGNAL_META } from '@/components/signals/meta';

export interface AlertKindMeta {
  label: string;
  icon: LucideIcon;
  description: string;
  /** What the rule watches. */
  subject: 'token' | 'wallet' | 'keyword' | 'signals' | 'holdings';
  /** How `value` is entered (none = no value). */
  value: 'usd-price' | 'usd' | 'pct' | 'count' | 'none';
  /** Uses above/below. */
  directional: boolean;
}

export const ALERT_KIND: Record<AlertKind, AlertKindMeta> = {
  price: { label: 'Price', icon: CircleDollarSign, description: 'Token price crosses a level.', subject: 'token', value: 'usd-price', directional: true },
  mcap: { label: 'Market cap', icon: Activity, description: 'Token market cap crosses a level.', subject: 'token', value: 'usd', directional: true },
  change: { label: '5m change', icon: Percent, description: 'Token moves by at least this much within 5 minutes.', subject: 'token', value: 'pct', directional: true },
  wallet_trade: { label: 'Wallet trade', icon: UserRound, description: 'A wallet buys or sells anything (or one token).', subject: 'wallet', value: 'none', directional: false },
  new_token: { label: 'New token', icon: Rocket, description: 'A token launches whose name or symbol contains a keyword.', subject: 'keyword', value: 'none', directional: false },
  smart_buys: { label: 'Smart buys', icon: Brain, description: 'A token gets at least N smart-money buys within 5 minutes.', subject: 'token', value: 'count', directional: false },
  holding: {
    label: 'Holding',
    icon: BriefcaseBusiness,
    description: 'Your open positions: a move against your cost (or within 5 minutes), the dev selling, or liquidity draining. Watches every token you hold on the chain, or just one.',
    subject: 'holdings',
    value: 'none',
    directional: false,
  },
  signal_subscription: {
    label: 'Signal subscription',
    icon: Radio,
    description: 'In-app notifications when the signals you pick fire on tokens that pass your filters. A token’s signals within a minute arrive as one notification.',
    subject: 'signals',
    value: 'none',
    directional: false,
  },
};

/** "Smart buy, KOL buy +2" (or "Any signal") for a subscription's kinds. */
export function signalKindsLabel(groups: SignalFilterGroup[], max = 3): string {
  if (groups.some((g) => g.kinds.length === 0)) return 'Any signal';
  const kinds = [...new Set(groups.flatMap((g) => g.kinds))];
  const shown = kinds.slice(0, max).map((k) => SIGNAL_META[k]?.label ?? k);
  return `${shown.join(', ')}${kinds.length > max ? ` +${kinds.length - max}` : ''}`;
}

/** "+20% / −30% vs cost · Dev sells · Liquidity −50%" for a holding rule's triggers. */
export function holdingTriggersLabel(h: HoldingAlertSpec): string {
  const parts: string[] = [];
  const where = h.basis === 'vs_cost' ? 'vs cost' : 'in 5m';
  const moves = [h.upPct !== null ? `+${h.upPct}%` : '', h.downPct !== null ? `−${h.downPct}%` : ''].filter(Boolean);
  if (moves.length) parts.push(`${moves.join(' / ')} ${where}`);
  if (h.devSell) parts.push('Dev sells');
  if (h.liquidityDropPct !== null) parts.push(`Liquidity −${h.liquidityDropPct}%`);
  return parts.join(' · ');
}

/** "Liq ≥ $10K · MC $50K–$1M · ≥ 50 holders · Quality" for one group's filters ('' when none). */
export function signalFiltersLabel(g: SignalFilterGroup): string {
  const parts: string[] = [];
  const set = (v: number | null | undefined): v is number => v !== null && v !== undefined;
  if (set(g.minLiquidityUsd)) parts.push(`Liq ≥ ${formatUsd(g.minLiquidityUsd)}`);
  if (set(g.mcMin) || set(g.mcMax)) parts.push(`MC ${set(g.mcMin) ? formatUsd(g.mcMin) : '$0'}–${set(g.mcMax) ? formatUsd(g.mcMax) : '∞'}`);
  if (set(g.minHolders)) parts.push(`≥ ${g.minHolders} holders`);
  if (set(g.maxTop10)) parts.push(`Top 10 ≤ ${formatPercent(g.maxTop10, { sign: false, digits: 0 })}`);
  if (set(g.maxAgeMin)) parts.push(`Age ≤ ${g.maxAgeMin}m`);
  if (g.excludeRisk) parts.push('Quality');
  return parts.join(' · ');
}

export const ALERT_KINDS = Object.keys(ALERT_KIND) as AlertKind[];

export const NOTIFICATION_KIND: Record<NotificationKind, { label: string; icon: LucideIcon; className: string }> = {
  order_filled: { label: 'Order filled', icon: CircleCheck, className: 'text-up' },
  order_failed: { label: 'Order failed', icon: CircleX, className: 'text-down' },
  alert: { label: 'Alert', icon: BellRing, className: 'text-warn' },
  copytrade: { label: 'Copy trade', icon: Repeat2, className: 'text-info' },
  sniper: { label: 'Sniper', icon: Crosshair, className: 'text-accent' },
  follow_trade: { label: 'Followed wallet', icon: Star, className: 'text-info' },
  signal: { label: 'Signal', icon: Radio, className: 'text-accent' },
  system: { label: 'System', icon: Info, className: 'text-muted' },
};

/** Notification filter groups for the list toolbar. */
export const NOTIFICATION_GROUPS: { value: string; label: string; kinds: NotificationKind[] | null }[] = [
  { value: 'all', label: 'All', kinds: null },
  { value: 'orders', label: 'Orders', kinds: ['order_filled', 'order_failed'] },
  { value: 'alerts', label: 'Alerts', kinds: ['alert'] },
  { value: 'signals', label: 'Signals', kinds: ['signal'] },
  { value: 'auto', label: 'Copy & snipe', kinds: ['copytrade', 'sniper'] },
  { value: 'follows', label: 'Follows', kinds: ['follow_trade'] },
  { value: 'system', label: 'System', kinds: ['system'] },
];
