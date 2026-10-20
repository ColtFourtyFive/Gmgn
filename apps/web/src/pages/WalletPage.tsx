// Wallet page (/:chain/address/:address): identity header with follow / copy
// trade / share, period stats cards (PnL + daily calendar, Analysis, PnL
// distribution) and tabs (Recent PnL, Holdings, live Activity, Created tokens).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { shortAddress, WALLET_PERIODS, type ChainId, type WalletPeriod } from '@trenchscope/shared';
import { Activity, Coins, History, Rocket, SearchX } from 'lucide-react';
import { useViewerTags } from '@/components/discovery/useViewerTags';
import { Page } from '@/components/layout';
import { Button, EmptyState, ErrorState, Panel, Skeleton, SkeletonText, Tabs } from '@/components/ui';
import {
  ActivityTab,
  AnalysisCard,
  CreatedTokensTab,
  DistributionCard,
  HoldingsTab,
  isNotFound,
  mergeTags,
  normAddress,
  PnlCard,
  RecentPnlTab,
  sameWallet,
  useWalletLive,
  useWalletProfileQuery,
  WalletHeader,
} from '@/components/wallet';
import { useLocalStorage } from '@/hooks';
import { routes, useChain } from '@/lib/chain';
import { useSession } from '@/store/session';

type TabKey = 'recent' | 'holdings' | 'activity' | 'created';
const TABS: TabKey[] = ['recent', 'holdings', 'activity', 'created'];

export default function WalletPage() {
  const chain = useChain();
  const { address = '' } = useParams();
  const addr = normAddress(chain, address);
  return <Wallet key={`${chain}:${addr}`} chain={chain} address={addr} />;
}

function HeaderSkeleton() {
  return (
    <div className="panel flex flex-col gap-3 p-4" aria-busy>
      <div className="flex items-center gap-3">
        <Skeleton circle width={52} height={52} />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-8 w-64 md:block" />
      </div>
      <div className="flex flex-wrap gap-5 border-t border-line pt-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-28" />
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Panel key={i} title={<Skeleton className="h-4 w-24" />} className={i === 2 ? 'md:col-span-2 xl:col-span-1' : undefined}>
          <Skeleton className="mb-3 h-8 w-40" />
          <SkeletonText lines={5} />
        </Panel>
      ))}
    </div>
  );
}

function validPeriod(p: unknown): WalletPeriod {
  return WALLET_PERIODS.includes(p as WalletPeriod) ? (p as WalletPeriod) : '7d';
}

function Wallet({ chain, address }: { chain: ChainId; address: string }) {
  const navigate = useNavigate();
  const q = useWalletProfileQuery(chain, address);
  const profile = q.data;
  const [storedPeriod, setPeriod] = useLocalStorage<WalletPeriod>('ts.wallet.period', '7d');
  const period = validPeriod(storedPeriod);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as TabKey | null;
  const [tab, setTabState] = useState<TabKey>(tabParam && TABS.includes(tabParam) ? tabParam : 'recent');
  const setTab = (t: TabKey) => {
    setTabState(t);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (t === 'recent') next.delete('tab');
        else next.set('tab', t);
        return next;
      },
      { replace: true },
    );
  };

  const viewerTags = useViewerTags(chain);
  const own = useSession((s) => s.account?.wallets[chain]?.address ?? null);
  const isOwn = sameWallet(chain, own, address);
  const tags = useMemo(() => (profile ? mergeTags(profile.tags, viewerTags(profile.address)) : []), [profile, viewerTags]);
  const live = useWalletLive(chain, address, !!profile);

  const name = profile ? profile.remark || profile.label || shortAddress(profile.address) : shortAddress(address);
  useEffect(() => {
    const prev = document.title;
    document.title = `${name} · Wallet · Trenchscope`;
    return () => {
      document.title = prev;
    };
  }, [name]);

  const hasCreated = (profile?.createdTokenCount ?? 0) > 0;
  const activeTab = tab === 'created' && profile && !hasCreated ? 'recent' : tab;

  if (!profile) {
    if (q.isError && isNotFound(q.error))
      return (
        <Page>
          <Panel>
            <EmptyState
              icon={<SearchX size={18} />}
              title="Wallet not found"
              description={`No ${chain.toUpperCase()} wallet with the address ${shortAddress(address, 6, 6)} has traded on Trenchscope's simulated market.`}
              action={
                <Button size="sm" variant="outline" onClick={() => navigate(routes.leaderboard(chain))}>
                  Browse top wallets
                </Button>
              }
            />
          </Panel>
        </Page>
      );
    if (q.isError)
      return (
        <Page>
          <Panel>
            <ErrorState title="Couldn’t load this wallet" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
          </Panel>
        </Page>
      );
    return (
      <Page className="flex flex-col gap-3">
        <HeaderSkeleton />
        <CardsSkeleton />
      </Page>
    );
  }

  const stats = profile.stats[period];

  return (
    <Page className="flex max-w-[1600px] flex-col gap-3">
      <WalletHeader chain={chain} profile={profile} tags={tags} isOwn={isOwn} period={period} onPeriodChange={setPeriod} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <PnlCard stats={stats} period={period} />
        <AnalysisCard stats={stats} style={profile.style} period={period} />
        <DistributionCard stats={stats} period={period} className="md:col-span-2 xl:col-span-1" />
      </div>
      <section className="panel min-w-0" aria-label="Wallet trades">
        <Tabs
          aria-label="Wallet sections"
          value={activeTab}
          onChange={setTab}
          className="px-2"
          items={[
            { value: 'recent', label: 'Recent PnL', icon: <History size={14} /> },
            { value: 'holdings', label: 'Holdings', icon: <Coins size={14} /> },
            { value: 'activity', label: 'Activity', icon: <Activity size={14} />, count: live.trades.length > 0 ? live.trades.length : null },
            ...(hasCreated ? [{ value: 'created' as const, label: 'Created tokens', icon: <Rocket size={14} />, count: profile.createdTokenCount }] : []),
          ]}
        />
        <div role="tabpanel" aria-label={activeTab}>
          {activeTab === 'recent' && <RecentPnlTab chain={chain} address={profile.address} />}
          {activeTab === 'holdings' && <HoldingsTab chain={chain} address={profile.address} />}
          {activeTab === 'activity' && <ActivityTab chain={chain} address={profile.address} live={live} />}
          {activeTab === 'created' && <CreatedTokensTab chain={chain} address={profile.address} />}
        </div>
      </section>
    </Page>
  );
}
