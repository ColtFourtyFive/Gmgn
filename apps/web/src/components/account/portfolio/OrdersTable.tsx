import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { formatDuration, type Order } from '@trenchscope/shared';
import { ListChecks, History, X } from 'lucide-react';
import { Age, ChainIcon } from '@/components/common';
import { DataTable, EmptyState, IconButton, Spinner, type Column } from '@/components/ui';
import { useNow } from '@/hooks';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { ORDER_KIND_LABEL, OrderAmount, OrderKindCell, OrderResult, OrderStatusBadge, OrderTrigger, SideBadge } from '../orders';

function TokenCell({ order, showChain }: { order: Order; showChain: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {showChain && <ChainIcon chain={order.chain} size={12} />}
      <Link to={routes.token(order.chain, order.token)} className="link truncate font-semibold" title={order.token}>
        {order.tokenSymbol}
      </Link>
    </span>
  );
}

/** Live "in 3h 5m" until expiry, or GTC. */
function Expiry({ at }: { at: number | null }) {
  const now = useNow();
  if (!at) return <span className="text-faint">GTC</span>;
  return <span className="num whitespace-nowrap text-muted">in {formatDuration(Math.max(0, (at - now) / 1000))}</span>;
}

function CancelButton({ order }: { order: Order }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const cancel = async () => {
    setPending(true);
    try {
      await api.cancelOrder(order.id);
      toast.info('Order cancelled', `${ORDER_KIND_LABEL[order.kind]} · ${order.tokenSymbol}`);
      await qc.invalidateQueries({ queryKey: ['orders'] });
    } catch (err) {
      toast.error('Cancel failed', errorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <IconButton
      size="xs"
      variant="outline"
      label={`Cancel ${ORDER_KIND_LABEL[order.kind].toLowerCase()} on ${order.tokenSymbol}`}
      icon={pending ? <Spinner size={11} label="" /> : <X size={12} />}
      disabled={pending}
      onClick={() => void cancel()}
      className="hover:!border-down/60 hover:!text-down"
    />
  );
}

export interface OrdersTableProps {
  mode: 'open' | 'history';
  rows: Order[];
  loading: boolean;
  showChain: boolean;
}

/** Open orders (with cancel) or order history (status + fill result). */
export function OrdersTable({ mode, rows, loading, showChain }: OrdersTableProps) {
  const { compactRows } = useDisplaySettings();

  const columns = useMemo<Column<Order>[]>(() => {
    const token: Column<Order> = { key: 'token', header: 'Token', sticky: true, width: 120, render: (o) => <TokenCell order={o} showChain={showChain} /> };
    const kind: Column<Order> = { key: 'kind', header: 'Type', render: (o) => <OrderKindCell order={o} /> };
    const side: Column<Order> = { key: 'side', header: 'Side', render: (o) => <SideBadge side={o.side} /> };
    const trigger: Column<Order> = { key: 'trigger', header: 'Trigger', render: (o) => <OrderTrigger order={o} /> };
    const amount: Column<Order> = { key: 'amount', header: 'Amount', align: 'right', render: (o) => <OrderAmount order={o} /> };
    if (mode === 'open') {
      return [
        token,
        kind,
        side,
        trigger,
        amount,
        { key: 'status', header: 'Status', hideBelow: 'md', render: (o) => <OrderStatusBadge order={o} /> },
        { key: 'created', header: 'Placed', align: 'right', sortable: true, sortValue: (o) => o.createdAt, render: (o) => <Age ts={o.createdAt} suffix=" ago" className="text-muted" /> },
        { key: 'expires', header: 'Expires', align: 'right', hideBelow: 'lg', render: (o) => <Expiry at={o.expiresAt} /> },
        { key: 'cancel', header: <span className="sr-only">Cancel</span>, align: 'right', width: 44, render: (o) => <CancelButton order={o} /> },
      ];
    }
    return [
      token,
      kind,
      side,
      { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge order={o} /> },
      { ...trigger, hideBelow: 'md' },
      amount,
      { key: 'result', header: 'Result', render: (o) => <OrderResult order={o} /> },
      {
        key: 'updated',
        header: 'Closed',
        align: 'right',
        sortable: true,
        sortValue: (o) => o.filledAt ?? o.updatedAt,
        render: (o) => <Age ts={o.filledAt ?? o.updatedAt} suffix=" ago" className="text-muted" />,
      },
    ];
  }, [mode, showChain]);

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(o) => o.id}
      defaultSort={{ key: mode === 'open' ? 'created' : 'updated', dir: 'desc' }}
      loading={loading}
      skeletonRows={4}
      compact={compactRows}
      minWidth={mode === 'open' ? 760 : 820}
      aria-label={mode === 'open' ? 'Open orders' : 'Order history'}
      empty={
        mode === 'open' ? (
          <EmptyState
            icon={<ListChecks size={18} />}
            title="No open orders"
            description="Limit orders and take-profit / stop-loss exits you attach to buys wait here until they trigger."
          />
        ) : (
          <EmptyState icon={<History size={18} />} title="No order history yet" description="Filled, cancelled and expired orders are listed here." />
        )
      }
    />
  );
}
