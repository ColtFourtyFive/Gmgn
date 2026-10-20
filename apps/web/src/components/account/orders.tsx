// Display helpers for Order rows (open orders, order history).

import type { Order, OrderKind, OrderStatus } from '@trenchscope/shared';
import { Compact, Native, Pct, Price, Usd } from '@/components/common';
import { Badge, type BadgeTone } from '@/components/ui';

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  limit_buy: 'Limit buy',
  limit_sell: 'Limit sell',
  take_profit: 'Take profit',
  stop_loss: 'Stop loss',
  trailing_stop: 'Trailing stop',
  dev_sell: 'Dev-sell exit',
  migration_buy: 'Migration buy',
  migration_sell: 'Migration sell',
};

const SOURCE_LABEL: Record<Order['source'], string> = { manual: 'Manual', strategy: 'Strategy', copytrade: 'Copy', sniper: 'Sniper' };

const STATUS: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  open: { label: 'Open', tone: 'info' },
  filled: { label: 'Filled', tone: 'up' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'down' },
  expired: { label: 'Expired', tone: 'warn' },
};

/** "Take profit" + origin chip. */
export function OrderKindCell({ order }: { order: Order }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-fg">{ORDER_KIND_LABEL[order.kind]}</span>
      {order.source !== 'manual' && <Badge tone="neutral">{SOURCE_LABEL[order.source]}</Badge>}
    </span>
  );
}

export function SideBadge({ side }: { side: Order['side'] }) {
  return <Badge tone={side === 'buy' ? 'up' : 'down'}>{side === 'buy' ? 'Buy' : 'Sell'}</Badge>;
}

export function OrderStatusBadge({ order }: { order: Order }) {
  const s = STATUS[order.status];
  if (order.status === 'open' && !order.armed) return <Badge tone="neutral" title="Waiting for the activation gain">Waiting</Badge>;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Human trigger condition: "≥ $0.0₅12", "MC ≤ $40K", "+100% from entry", "-15% from peak after +50%". */
export function OrderTrigger({ order }: { order: Order }) {
  const cmp = order.direction === 'below' ? '≤' : '≥';
  switch (order.triggerType) {
    case 'price':
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted">Price {cmp} </span>
          <Price value={order.triggerValue} />
        </span>
      );
    case 'mcap':
      return (
        <span className="whitespace-nowrap">
          <span className="text-muted">MC {cmp} </span>
          <Usd value={order.triggerValue} />
        </span>
      );
    case 'change':
      if (order.kind === 'trailing_stop') {
        return (
          <span className="whitespace-nowrap">
            <Pct value={-order.triggerValue} ratio={false} digits={0} />
            <span className="text-muted"> from peak</span>
            {order.activateAtChangePct ? (
              <span className="text-muted">
                {' '}
                after <Pct value={order.activateAtChangePct} ratio={false} digits={0} colored={false} />
              </span>
            ) : null}
          </span>
        );
      }
      return (
        <span className="whitespace-nowrap">
          <Pct value={order.kind === 'stop_loss' ? -order.triggerValue : order.triggerValue} ratio={false} digits={0} />
          <span className="text-muted"> from entry</span>
        </span>
      );
    case 'event':
      if (order.kind === 'dev_sell') {
        return (
          <span className="whitespace-nowrap text-muted">
            Dev sells{order.devSellThreshold ? <> ≥ <Pct value={order.devSellThreshold} sign={false} colored={false} digits={0} /></> : null}
          </span>
        );
      }
      return <span className="whitespace-nowrap text-muted">On migration</span>;
  }
}

/** Order size: "0.5 SOL", "50% of position", "1.2M tokens". */
export function OrderAmount({ order }: { order: Order }) {
  if (order.amountKind === 'native') return <Native value={order.amount} chain={order.chain} />;
  if (order.amountKind === 'percent') {
    return (
      <span className="whitespace-nowrap">
        <Pct value={order.amount} ratio={false} sign={false} colored={false} digits={0} />
        <span className="text-muted"> of position</span>
      </span>
    );
  }
  return <Compact value={order.amount} suffix={` ${order.tokenSymbol}`} />;
}

/** Filled: native size @ price. Failed: the reason. */
export function OrderResult({ order }: { order: Order }) {
  if (order.status === 'filled' && order.receipt) {
    return (
      <span className="whitespace-nowrap">
        <Native value={order.receipt.nativeAmount} chain={order.chain} /> <span className="text-muted">@</span> <Price value={order.receipt.priceUsd} />
      </span>
    );
  }
  if (order.failReason) {
    return (
      <span className="block max-w-[220px] truncate text-down" title={order.failReason}>
        {order.failReason}
      </span>
    );
  }
  return <span className="text-faint">—</span>;
}
