import type { AlertKind, NotificationKind } from '@trenchscope/shared';
import { Activity, BellRing, Brain, CircleCheck, CircleDollarSign, CircleX, Crosshair, Info, Percent, Repeat2, Rocket, Star, UserRound, type LucideIcon } from 'lucide-react';

export interface AlertKindMeta {
  label: string;
  icon: LucideIcon;
  description: string;
  /** What the rule watches. */
  subject: 'token' | 'wallet' | 'keyword';
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
};

export const ALERT_KINDS = Object.keys(ALERT_KIND) as AlertKind[];

export const NOTIFICATION_KIND: Record<NotificationKind, { label: string; icon: LucideIcon; className: string }> = {
  order_filled: { label: 'Order filled', icon: CircleCheck, className: 'text-up' },
  order_failed: { label: 'Order failed', icon: CircleX, className: 'text-down' },
  alert: { label: 'Alert', icon: BellRing, className: 'text-warn' },
  copytrade: { label: 'Copy trade', icon: Repeat2, className: 'text-info' },
  sniper: { label: 'Sniper', icon: Crosshair, className: 'text-accent' },
  follow_trade: { label: 'Followed wallet', icon: Star, className: 'text-info' },
  system: { label: 'System', icon: Info, className: 'text-muted' },
};

/** Notification filter groups for the list toolbar. */
export const NOTIFICATION_GROUPS: { value: string; label: string; kinds: NotificationKind[] | null }[] = [
  { value: 'all', label: 'All', kinds: null },
  { value: 'orders', label: 'Orders', kinds: ['order_filled', 'order_failed'] },
  { value: 'alerts', label: 'Alerts', kinds: ['alert'] },
  { value: 'auto', label: 'Copy & snipe', kinds: ['copytrade', 'sniper'] },
  { value: 'follows', label: 'Follows', kinds: ['follow_trade'] },
  { value: 'system', label: 'System', kinds: ['system'] },
];
