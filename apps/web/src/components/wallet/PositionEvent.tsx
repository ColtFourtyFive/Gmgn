// Position event chips (FeedItem.positionEvent): what a trade did to the
// maker's position. Shared by the Monitor feeds, wallet activity and the
// portfolio / token position logs; open and close stand out, add and reduce
// stay quiet.

import type { FeedItem, PositionEvent } from '@trenchscope/shared';
import { Badge, type BadgeTone } from '@/components/ui';

export const POSITION_EVENT_META: Record<PositionEvent, { label: string; tone: BadgeTone; hint: string }> = {
  open: { label: 'Open', tone: 'info', hint: 'Re-entered after closing the position' },
  add: { label: 'Add', tone: 'neutral', hint: 'Bought more while holding' },
  reduce: { label: 'Reduce', tone: 'neutral', hint: 'Sold part of the position' },
  close: { label: 'Close', tone: 'warn', hint: 'Sold the whole position' },
};

/** The item's event; items without one (live placeholders) fall back to the first-buy / close flags. */
export function positionEventOf(item: Pick<FeedItem, 'positionEvent' | 'isFirstBuy' | 'isClose'>): PositionEvent | null {
  if (item.positionEvent) return item.positionEvent;
  if (item.isFirstBuy) return 'open';
  if (item.isClose) return 'close';
  return null;
}

/** Open / Add / Reduce / Close chip; an open that is the wallet's very first buy says so in its hint. */
export function PositionEventBadge({ item, className }: { item: Pick<FeedItem, 'positionEvent' | 'isFirstBuy' | 'isClose'>; className?: string }) {
  const event = positionEventOf(item);
  if (!event) return null;
  const meta = POSITION_EVENT_META[event];
  const hint = event === 'open' && item.isFirstBuy ? 'First buy of this token' : meta.hint;
  return (
    <Badge tone={meta.tone} title={hint} className={className}>
      {meta.label}
    </Badge>
  );
}
