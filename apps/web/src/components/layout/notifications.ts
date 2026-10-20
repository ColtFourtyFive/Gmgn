// Presentation of AppNotification kinds, shared by the bell and the alerts page.

import type { AppNotification, NotificationKind } from '@trenchscope/shared';
import { BellRing, CircleCheck, CircleX, Crosshair, Info, Radio, Repeat2, Star, type LucideIcon } from 'lucide-react';

export interface NotificationKindMeta {
  label: string;
  icon: LucideIcon;
  /** Text color class for the icon. */
  className: string;
}

export const NOTIFICATION_KIND_META: Record<NotificationKind, NotificationKindMeta> = {
  order_filled: { label: 'Order filled', icon: CircleCheck, className: 'text-up' },
  order_failed: { label: 'Order failed', icon: CircleX, className: 'text-down' },
  alert: { label: 'Alert', icon: BellRing, className: 'text-warn' },
  copytrade: { label: 'Copy trade', icon: Repeat2, className: 'text-info' },
  sniper: { label: 'Sniper', icon: Crosshair, className: 'text-accent' },
  follow_trade: { label: 'Followed wallet', icon: Star, className: 'text-info' },
  signal: { label: 'Signal', icon: Radio, className: 'text-accent' },
  system: { label: 'System', icon: Info, className: 'text-muted' },
};

/** Meta for one notification: its kind's, but a red failure icon when it carries `level: 'error'`. */
export function notificationMeta(n: AppNotification): NotificationKindMeta {
  const meta = NOTIFICATION_KIND_META[n.kind];
  return n.level === 'error' ? { ...meta, icon: CircleX, className: 'text-down' } : meta;
}
