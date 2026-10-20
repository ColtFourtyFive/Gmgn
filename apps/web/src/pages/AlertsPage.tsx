import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { isChainId, type AlertRule } from '@trenchscope/shared';
import { Bell, BellPlus, BellRing } from 'lucide-react';
import { AccountGate, accountKeys, isAddressFor, useSignedIn } from '@/components/account';
import { AlertForm, type AlertFormProps } from '@/components/account/alerts/AlertForm';
import { AlertsTable } from '@/components/account/alerts/AlertsTable';
import { NotificationsList } from '@/components/account/alerts/NotificationsList';
import { Page, PageHeader } from '@/components/layout';
import { Button, ErrorState, Panel, Tabs } from '@/components/ui';
import { useActiveChain } from '@/hooks';
import { api } from '@/lib/api';
import { requireAuth } from '@/store/session';
import { useUi } from '@/store/ui';

type AlertsTab = 'alerts' | 'notifications';
type DrawerState = { rule: AlertRule | null; prefill?: AlertFormProps['prefill'] } | null;

export default function AlertsPage() {
  const signedIn = useSignedIn();
  const chain = useActiveChain();
  const [params, setParams] = useSearchParams();
  const tab: AlertsTab = params.get('tab') === 'notifications' ? 'notifications' : 'alerts';
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const unread = useUi((s) => s.unreadCount);
  const rules = useQuery({ queryKey: accountKeys.alerts, queryFn: api.alerts, enabled: signedIn, refetchInterval: 15_000 });

  const setTab = (t: AlertsTab) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (t === 'alerts') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true },
    );

  // ?token=<address>[&chain=] (from a token page) opens a prefilled price alert.
  const tokenParam = params.get('token');
  useEffect(() => {
    if (!tokenParam || !signedIn) return;
    const raw = params.get('chain');
    const c = isChainId(raw) ? raw : chain;
    setDrawer({ rule: null, prefill: isAddressFor(c, tokenParam) ? { kind: 'price', chain: c, token: tokenParam } : { chain: c } });
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('token');
        next.delete('chain');
        return next;
      },
      { replace: true },
    );
  }, [tokenParam, signedIn, chain, params, setParams]);

  const openNew = () =>
    requireAuth(() => {
      setTab('alerts');
      setDrawer({ rule: null });
    });
  const onEdit = useCallback((rule: AlertRule) => setDrawer({ rule }), []);

  const active = rules.data?.filter((r) => r.enabled).length ?? 0;

  return (
    <Page className="max-w-[1280px]">
      <PageHeader
        title="Alerts"
        subtitle="Price, market-cap, wallet and holding alerts, signal subscriptions, plus your notification history"
        icon={<Bell size={16} />}
        actions={
          <Button variant="primary" size="sm" icon={<BellPlus size={14} />} onClick={openNew}>
            New alert
          </Button>
        }
      />
      <AccountGate
        icon={<BellRing size={22} />}
        title="Never miss the move"
        description="Set alerts on prices, market caps, sudden pumps or dumps, smart-money buying, wallet trades, new launches matching a keyword, your own holdings, and the signals you subscribe to."
        features={['Eight alert types across every supported chain', 'Toasts in the app plus a full notification history', 'One-shot or repeating alerts with notes']}
      >
        <Panel padded={false}>
          <Tabs
            value={tab}
            onChange={setTab}
            aria-label="Alerts sections"
            className="px-2"
            items={[
              { value: 'alerts', label: 'Alerts', icon: <BellPlus size={13} />, count: rules.data ? active : undefined, title: 'Active alert rules' },
              { value: 'notifications', label: 'Notifications', icon: <Bell size={13} />, count: unread > 0 ? unread : undefined, title: 'Unread notifications' },
            ]}
          />
          <div role="tabpanel">
            {tab === 'alerts' ? (
              rules.isError && !rules.data ? (
                <ErrorState error={rules.error} onRetry={() => void rules.refetch()} retrying={rules.isFetching} />
              ) : (
                <AlertsTable rules={rules.data ?? []} loading={rules.isLoading} onEdit={onEdit} onNew={openNew} />
              )
            ) : (
              <NotificationsList />
            )}
          </div>
        </Panel>
      </AccountGate>
      <AlertForm open={drawer !== null} onClose={() => setDrawer(null)} rule={drawer?.rule ?? null} chain={chain} prefill={drawer?.prefill} />
    </Page>
  );
}
