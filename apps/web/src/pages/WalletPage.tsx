// Wallet page (/:chain/address/:address): identity header with follow / copy
// trade / share, period stats cards (PnL + daily calendar, Analysis, PnL
// distribution) and tabs (Recent PnL, Holdings, live Activity, Created tokens,
// Calls for wallets that call tokens).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { shortAddress, WALLET_PERIODS, type ChainId, type WalletPeriod } from '@trenchscope/shared';
import { Activity, Coins, History, MessageSquareQuote, Rocket, SearchX } from 'lucide-react';
import { useViewerTags } from '@/components/discovery/useViewerTags';
import { Page } from '@/components/layout';
import { Button, EmptyState, ErrorState, Panel, Skeleton, SkeletonText, Tabs } from '@/components/ui';
import {
  ActivityTab,
  AnalysisCard,
  CallsTab,
  CreatedTokensTab,
  DistributionCard,
  HoldingsTab,
  isNotFound,
  mergeTags,
  normAddress,
  PnlCard,
  RecentPnlTab,
  sameWallet,
  useWalletCalls,
  useWalletLive,
  useWalletProfileQuery,
  WalletHeader,
} from '@/components/wallet';
import { useIsLive, useLocalStorage } from '@/hooks';
import { routes, useChain } from '@/lib/chain';
import { useSession } from '@/store/session';

type TabKey = 'recent' | 'holdings' | 'activity' | 'created' | 'calls';
const TABS: TabKey[] = ['recent', 'holdings', 'activity', 'created', 'calls'];

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
  const liveMode = useIsLive();
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
  const notFound = !profile && q.isError && isNotFound(q.error);
  useEffect(() => {
    const prev = document.title;
    const title = notFound ? 'Wallet not found · Trenchscope' : `${name} · Wallet · Trenchscope`;
    if (document.title !== title) document.title = title;
    return () => {
      // Writing an unchanged title still mutates <title>, which the route announcer reads as a page change.
      if (document.title !== prev) document.title = prev;
    };
  }, [name, notFound]);

  const calls = useWalletCalls(chain, address, !!profile);
  const callCount = calls.data?.calls.length ?? 0;
  const hasCreated = (profile?.createdTokenCount ?? 0) > 0;
  // A deep link to a tab this wallet doesn't have falls back to Recent PnL once that is known.
  const activeTab = (tab === 'created' && profile && !hasCreated) || (tab === 'calls' && calls.data && callCount === 0) ? 'recent' : tab;

  if (!profile) {
    if (notFound)
      return (
        <Page>
          <Panel>
            <EmptyState
              icon={<SearchX size={18} />}
              title="Wallet not found"
              titleAs="h1"
              description={
                liveMode
                  ? `Trenchscope hasn't seen the ${chain.toUpperCase()} wallet ${shortAddress(address, 6, 6)} trade a tracked token yet.`
                  : `No ${chain.toUpperCase()} wallet with the address ${shortAddress(address, 6, 6)} has traded on Trenchscope's simulated market.`
              }
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
            <ErrorState title="Couldn’t load this wallet" titleAs="h1" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
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
            ...(callCount > 0 ? [{ value: 'calls' as const, label: 'Calls', icon: <MessageSquareQuote size={14} />, count: callCount }] : []),
          ]}
        />
        <div role="tabpanel" aria-label={activeTab}>
          {activeTab === 'recent' && <RecentPnlTab chain={chain} address={profile.address} trader={profile.label || shortAddress(profile.address)} />}
          {activeTab === 'holdings' && <HoldingsTab chain={chain} address={profile.address} />}
          {activeTab === 'activity' && <ActivityTab chain={chain} address={profile.address} live={live} />}
          {activeTab === 'created' && <CreatedTokensTab chain={chain} address={profile.address} />}
          {activeTab === 'calls' && <CallsTab chain={chain} address={profile.address} />}
        </div>
      </section>
    </Page>
  );
}
