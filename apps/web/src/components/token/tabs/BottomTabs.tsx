// Bottom tab set under the chart (and the Activity tab on phones).

import { forwardRef } from 'react';
import type { Position, TokenDetail } from '@trenchscope/shared';
import { Tabs, type TabItem } from '@/components/ui';
import { useSession } from '@/store/session';
import { useTokenOrders } from '../queries';
import { useTokenUi, type BottomTab } from '../store';
import { ActivityTab } from './ActivityTab';
import { DevTokensTab } from './DevTokensTab';
import { HoldersTab } from './HoldersTab';
import { OrdersTab } from './OrdersTab';
import { PositionTab } from './PositionTab';
import { TopTradersTab } from './TopTradersTab';

const TAB_LABEL: Record<BottomTab, string> = {
  activity: 'Activity',
  holders: 'Holders',
  traders: 'Top traders',
  position: 'My position',
  orders: 'Orders',
  dev: 'Dev tokens',
};

export interface BottomTabsProps {
  token: TokenDetail;
  position: Position | null;
  positionLoading: boolean;
  positionError: unknown;
  onRetryPosition: () => void;
  /** Table body height (tables scroll inside). */
  maxHeight: number | string;
  className?: string;
}

export const BottomTabs = forwardRef<HTMLElement, BottomTabsProps>(function BottomTabs({ token, position, positionLoading, positionError, onRetryPosition, maxHeight, className }, ref) {
  const tab = useTokenUi((s) => s.bottomTab);
  const setTab = useTokenUi((s) => s.setBottomTab);
  const signedIn = useSession((s) => !!s.token);
  const openOrders = useTokenOrders(token.chain, token.address, 'open');
  const held = position && position.balance > 0;

  const items: TabItem<BottomTab>[] = [
    { value: 'activity', label: 'Activity' },
    { value: 'holders', label: 'Holders', count: token.holderCount },
    { value: 'traders', label: 'Top traders' },
    {
      value: 'position',
      label: (
        <span className="inline-flex items-center gap-1">
          My position
          {signedIn && held && <span className="h-1.5 w-1.5 rounded-full bg-up" aria-label="(open)" />}
        </span>
      ),
    },
    { value: 'orders', label: 'Orders', count: signedIn ? (openOrders.data?.length ?? null) : null },
    { value: 'dev', label: 'Dev tokens', count: token.dev.tokens.length },
  ];

  return (
    <section ref={ref} id="token-tabs" aria-label="Token activity" className={className}>
      <div className="panel flex min-w-0 flex-col overflow-hidden">
        <Tabs value={tab} onChange={setTab} items={items} aria-label="Token details" className="px-1.5" />
        <div role="tabpanel" aria-label={TAB_LABEL[tab]} className="min-w-0">
          {tab === 'activity' && <ActivityTab token={token} maxHeight={maxHeight} />}
          {tab === 'holders' && <HoldersTab token={token} maxHeight={maxHeight} />}
          {tab === 'traders' && <TopTradersTab token={token} maxHeight={maxHeight} />}
          {tab === 'position' && <PositionTab token={token} position={position} loading={positionLoading} error={positionError} onRetry={onRetryPosition} maxHeight={maxHeight} />}
          {tab === 'orders' && <OrdersTab token={token} maxHeight={maxHeight} />}
          {tab === 'dev' && <DevTokensTab token={token} maxHeight={maxHeight} />}
        </div>
      </div>
    </section>
  );
});
