// The viewer's orders on this token: open (with cancel) and history.

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Order, TokenDetail } from '@trenchscope/shared';
import { ListOrdered, LogIn, X } from 'lucide-react';
import { Age } from '@/components/common';
import { OrderAmount, OrderKindCell, OrderResult, OrderStatusBadge, OrderTrigger, SideBadge } from '@/components/account';
import { Button, DataTable, EmptyState, ErrorState, IconButton, SegmentedControl, type Column } from '@/components/ui';
import { invalidateTradingQueries } from '@/hooks/useUserChannel';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { useTokenOrders } from '../queries';
import { useTokenUi } from '../store';

export function OrdersTab({ token, maxHeight }: { token: TokenDetail; maxHeight: number | string }) {
  const signedIn = useSession((s) => !!s.token);
  const qc = useQueryClient();
  const [status, setStatus] = useState<'open' | 'history'>('open');
  const open = useTokenOrders(token.chain, token.address, 'open');
  const history = useTokenOrders(token.chain, token.address, 'history', status === 'history');
  const q = status === 'open' ? open : history;
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());

  const cancel = async (o: Order) => {
    setCancelling((s) => new Set(s).add(o.id));
    try {
      await api.cancelOrder(o.id);
      toast.info('Order cancelled', `${o.tokenSymbol} · ${o.kind.replace('_', ' ')}`);
      invalidateTradingQueries(qc);
    } catch (err) {
      toast.error('Couldn’t cancel order', errorMessage(err));
    } finally {
      setCancelling((s) => {
        const n = new Set(s);
        n.delete(o.id);
        return n;
      });
    }
  };

  const cancelAll = async () => {
    const list = open.data ?? [];
    let failed = 0;
    for (const o of list) {
      try {
        await api.cancelOrder(o.id);
      } catch {
        failed++;
      }
    }
    invalidateTradingQueries(qc);
    if (failed) toast.error(`${failed} order${failed === 1 ? '' : 's'} not cancelled`);
    else toast.info(`${list.length} order${list.length === 1 ? '' : 's'} cancelled`);
  };

  const columns = useMemo<Column<Order>[]>(() => {
    const cols: Column<Order>[] = [
      { key: 'kind', header: 'Type', render: (o) => <OrderKindCell order={o} /> },
      { key: 'side', header: 'Side', width: 56, render: (o) => <SideBadge side={o.side} /> },
      { key: 'trigger', header: 'Trigger', render: (o) => <OrderTrigger order={o} /> },
      { key: 'amount', header: 'Amount', render: (o) => <OrderAmount order={o} /> },
      { key: 'status', header: 'Status', render: (o) => <OrderStatusBadge order={o} /> },
      { key: 'created', header: 'Created', align: 'right', render: (o) => <Age ts={o.createdAt} suffix=" ago" className="text-muted" /> },
    ];
    if (status === 'open') {
      cols.push({
        key: 'expires',
        header: 'Expires',
        align: 'right',
        hideBelow: 'md',
        render: (o) => (o.expiresAt ? <span className="num text-xs text-muted">{new Date(o.expiresAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span> : <span className="text-xs text-faint">GTC</span>),
      });
      cols.push({
        key: 'cancel',
        header: '',
        align: 'right',
        width: 40,
        render: (o) => <IconButton size="xs" variant="outline" label="Cancel order" icon={<X size={12} />} disabled={cancelling.has(o.id)} onClick={() => void cancel(o)} />,
      });
    } else {
      cols.push({ key: 'result', header: 'Result', render: (o) => <OrderResult order={o} /> });
      cols.push({ key: 'updated', header: 'Closed', align: 'right', render: (o) => <Age ts={o.updatedAt} suffix=" ago" className="text-muted" /> });
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cancelling]);

  if (!signedIn) {
    return (
      <EmptyState
        icon={<ListOrdered size={18} />}
        title="Limit and auto orders"
        description="Place limit, take-profit, stop-loss, dev-sell and migration orders from the trade panel."
        action={
          <span className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" size="sm" onClick={() => useSession.getState().promptAuth(true, 'quick')}>
              Start paper trading
            </Button>
            <Button variant="outline" size="sm" icon={<LogIn size={13} />} onClick={() => useSession.getState().promptAuth(true, 'login')}>
              Log in
            </Button>
          </span>
        }
      />
    );
  }

  const openCount = open.data?.length ?? null;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <SegmentedControl
          size="sm"
          value={status}
          onChange={setStatus}
          items={[
            { value: 'open', label: 'Open', count: openCount },
            { value: 'history', label: 'History' },
          ]}
          aria-label="Order status"
        />
        <span className="flex-1" />
        {status === 'open' && (openCount ?? 0) > 1 && (
          <Button size="xs" variant="danger" onClick={() => void cancelAll()}>
            Cancel all
          </Button>
        )}
      </div>
      {q.isError && !q.data ? (
        <ErrorState compact error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : (
        <DataTable
          aria-label={`${status === 'open' ? 'Open' : 'Past'} orders`}
          columns={columns}
          rows={q.data ?? []}
          rowKey={(o) => o.id}
          loading={q.isPending}
          skeletonRows={3}
          compact
          maxHeight={maxHeight}
          minWidth={760}
          empty={
            <EmptyState
              compact
              icon={<ListOrdered size={16} />}
              title={status === 'open' ? 'No open orders' : 'No past orders'}
              description={status === 'open' ? 'Use the Limit or Auto tab of the trade panel.' : 'Filled, cancelled and expired orders show up here.'}
              action={
                status === 'open' ? (
                  <Button size="xs" variant="outline" onClick={() => useTokenUi.getState().setMode('limit')}>
                    New limit order
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}
    </div>
  );
}
