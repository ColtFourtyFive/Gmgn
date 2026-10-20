import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@trenchscope/shared';
import { Bell, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { Age, ChainIcon } from '@/components/common';
import { Button, EmptyState, ErrorState, SegmentedControl, Skeleton, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage } from '@/lib/format';
import { toast } from '@/store/toasts';
import { useUi } from '@/store/ui';
import { accountKeys } from '../queries';
import { NOTIFICATION_GROUPS, NOTIFICATION_KIND } from './meta';

const LIMIT = 200;

function hrefOf(n: AppNotification): string | null {
  if (n.chain && n.token) return routes.token(n.chain, n.token);
  if (n.chain && n.wallet) return routes.wallet(n.chain, n.wallet);
  return null;
}

/** Mark notifications read in every cached ['notifications'] list (bell + this page) and sync the unread badge. */
function useMarkRead() {
  const qc = useQueryClient();
  return async (ids?: string[]) => {
    const snapshot = qc.getQueriesData<AppNotification[]>({ queryKey: ['notifications'] });
    qc.setQueriesData<AppNotification[]>({ queryKey: ['notifications'] }, (d) => (Array.isArray(d) ? d.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)) : d));
    const ui = useUi.getState();
    ui.setUnreadCount(ids ? ui.unreadCount - ids.length : 0);
    try {
      await api.markRead(ids);
    } catch (err) {
      for (const [key, data] of snapshot) qc.setQueryData(key, data);
      toast.error('Could not mark as read', errorMessage(err));
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    }
  };
}

/** Full notification history with kind filter, unread filter and mark-all-read. */
export function NotificationsList() {
  const navigate = useNavigate();
  const markRead = useMarkRead();
  const [group, setGroup] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = useQuery({ queryKey: accountKeys.notifications(LIMIT), queryFn: () => api.notifications(LIMIT), staleTime: 15_000 });
  const all = q.data ?? [];
  const unread = all.filter((n) => !n.read).length;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of NOTIFICATION_GROUPS) c[g.value] = g.kinds ? all.filter((n) => g.kinds!.includes(n.kind)).length : all.length;
    return c;
  }, [all]);

  const kinds = NOTIFICATION_GROUPS.find((g) => g.value === group)?.kinds ?? null;
  const shown = all.filter((n) => (!kinds || kinds.includes(n.kind)) && (!unreadOnly || !n.read));

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <SegmentedControl
          size="sm"
          value={group}
          onChange={setGroup}
          aria-label="Notification type"
          items={NOTIFICATION_GROUPS.filter((g) => g.value === 'all' || counts[g.value] > 0 || g.value === group).map((g) => ({ value: g.value, label: g.label, count: counts[g.value] }))}
        />
        <Toggle size="sm" checked={unreadOnly} onChange={setUnreadOnly} label={<span className="text-xs text-muted">Unread only</span>} />
        <Button size="xs" variant="ghost" icon={<CheckCheck size={13} />} disabled={unread === 0} onClick={() => void markRead()} className="ml-auto text-accent">
          Mark all read{unread > 0 ? ` (${unread})` : ''}
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex flex-col gap-3 p-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton circle width={18} height={18} />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Bell size={18} />}
          title={all.length === 0 ? 'No notifications yet' : 'Nothing here'}
          description={
            all.length === 0
              ? 'Order fills, alerts, copy trades, snipes and trades by wallets you follow (with notifications on) show up here.'
              : 'No notifications match these filters.'
          }
        />
      ) : (
        <ul aria-label="Notifications">
          {shown.map((n) => {
            const meta = NOTIFICATION_KIND[n.kind];
            const href = hrefOf(n);
            return (
              <li key={n.id} className="border-b border-line/60 last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!n.read) void markRead([n.id]);
                    if (href) navigate(href);
                  }}
                  className={clsx('flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-panel-2', !n.read && 'bg-accent/[0.04]')}
                >
                  <meta.icon size={16} className={clsx('mt-0.5 shrink-0', meta.className)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={clsx('truncate text-sm', n.read ? 'text-muted' : 'font-medium text-fg')}>{n.title}</span>
                      {n.chain && <ChainIcon chain={n.chain} size={12} />}
                    </span>
                    <span className="block text-xs text-muted">{n.body}</span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-faint">
                      <span>{meta.label}</span>·<Age ts={n.createdAt} suffix=" ago" />
                      {href && <span className="text-accent">· {n.token ? 'View token' : 'View wallet'}</span>}
                    </span>
                  </span>
                  {!n.read && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {all.length >= LIMIT && <p className="border-t border-line px-3 py-2 text-center text-xs text-faint">Showing the latest {LIMIT} notifications.</p>}
    </div>
  );
}
