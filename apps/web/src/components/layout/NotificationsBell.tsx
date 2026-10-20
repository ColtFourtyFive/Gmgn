import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppNotification } from '@trenchscope/shared';
import { Bell } from 'lucide-react';
import clsx from 'clsx';
import { Age } from '@/components/common';
import { EmptyState, ErrorState, IconButton, Popover, SkeletonText } from '@/components/ui';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import { notificationMeta } from './notifications';

const KEY = ['notifications'];

function hrefOf(n: AppNotification): string | null {
  if (n.chain && n.token) return routes.token(n.chain, n.token);
  if (n.chain && n.wallet) return routes.wallet(n.chain, n.wallet);
  return null;
}

/** Bell with unread badge; popover lists recent notifications (signed-in only). */
export function NotificationsBell() {
  const signedIn = useSession((s) => !!s.token);
  const unread = useUi((s) => s.unreadCount);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: KEY, queryFn: () => api.notifications(30), enabled: signedIn, staleTime: 30_000 });

  useEffect(() => {
    useUi.getState().setUnreadCount(signedIn && list.data ? list.data.filter((n) => !n.read).length : 0);
  }, [signedIn, list.data]);

  if (!signedIn) return null;

  const markRead = (ids?: string[]) => {
    qc.setQueryData<AppNotification[]>(KEY, (d) => d?.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)));
    api.markRead(ids).catch(() => void qc.invalidateQueries({ queryKey: KEY }));
  };

  const badge = unread > 0 ? (unread > 99 ? '99+' : unread) : undefined;
  return (
    <Popover
      placement="bottom-end"
      aria-label="Notifications"
      className="w-[360px] max-w-[calc(100vw-16px)]"
      trigger={<IconButton label={unread ? `Notifications (${unread} unread)` : 'Notifications'} icon={<Bell size={16} />} badge={badge} />}
    >
      {(close) => (
        <div className="flex max-h-[min(70vh,520px)] flex-col">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {/* aria-disabled, not disabled: it is usually focused when pressed, and a disabled button would drop focus to <body>. */}
            <button
              type="button"
              aria-disabled={unread === 0}
              onClick={() => unread > 0 && markRead()}
              className="text-xs font-medium text-accent hover:underline aria-disabled:cursor-default aria-disabled:text-faint aria-disabled:no-underline"
            >
              Mark all read
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading ? (
              <SkeletonText lines={4} className="p-3" />
            ) : list.isError ? (
              <ErrorState compact error={list.error} onRetry={() => void list.refetch()} retrying={list.isFetching} />
            ) : !list.data?.length ? (
              <EmptyState compact icon={<Bell size={16} />} title="No notifications yet" description="Order fills, alerts and followed-wallet trades show up here." />
            ) : (
              <ul>
                {list.data.map((n) => {
                  const meta = notificationMeta(n);
                  const href = hrefOf(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!n.read) markRead([n.id]);
                          close();
                          if (href) navigate(href);
                        }}
                        className="flex w-full gap-2.5 border-b border-line/60 px-3 py-2.5 text-left transition-colors hover:bg-panel-2"
                      >
                        <meta.icon size={15} className={clsx('mt-0.5 shrink-0', meta.className)} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={clsx('block truncate text-sm', n.read ? 'text-muted' : 'font-medium text-fg')}>{n.title}</span>
                          <span className="line-clamp-2 text-xs text-muted">{n.body}</span>
                          <Age ts={n.createdAt} suffix=" ago" className="text-2xs text-faint" />
                        </span>
                        {!n.read && <span aria-label="Unread" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
