import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { isChainId } from '@trenchscope/shared';
import AppShell from '@/components/layout/AppShell';
import { lastChain, rememberChain } from '@/lib/chain';
import { useSession } from '@/store/session';

const TrenchesPage = lazy(() => import('@/pages/TrenchesPage'));
const TrendingPage = lazy(() => import('@/pages/TrendingPage'));
const NewPairsPage = lazy(() => import('@/pages/NewPairsPage'));
const NarrativesPage = lazy(() => import('@/pages/NarrativesPage'));
const TokenPage = lazy(() => import('@/pages/TokenPage'));
const WalletPage = lazy(() => import('@/pages/WalletPage'));
const LeaderboardPage = lazy(() => import('@/pages/LeaderboardPage'));
const MonitorPage = lazy(() => import('@/pages/MonitorPage'));
const SignalsPage = lazy(() => import('@/pages/SignalsPage'));
const CopyTradePage = lazy(() => import('@/pages/CopyTradePage'));
const SniperPage = lazy(() => import('@/pages/SniperPage'));
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage'));
const WatchlistPage = lazy(() => import('@/pages/WatchlistPage'));
const AlertsPage = lazy(() => import('@/pages/AlertsPage'));
const RewardsPage = lazy(() => import('@/pages/RewardsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const UiGalleryPage = lazy(() => import('@/pages/UiGalleryPage'));

/** Validates :chain and remembers it; unknown chains redirect to the last used chain. */
function ChainGuard({ children }: { children: React.ReactNode }) {
  const { chain } = useParams();
  const valid = isChainId(chain);
  useEffect(() => {
    if (valid) rememberChain(chain);
  }, [chain, valid]);
  if (!valid) return <Navigate to={`/${lastChain()}/trenches`} replace />;
  return <>{children}</>;
}

function PageFallback() {
  return <div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted">Loading…</div>;
}

export default function App() {
  const init = useSession((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  const chainRoute = (path: string, el: React.ReactNode) => <Route path={`/:chain/${path}`} element={<ChainGuard>{el}</ChainGuard>} />;

  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={`/${lastChain()}/trenches`} replace />} />
          {chainRoute('trenches', <TrenchesPage />)}
          {chainRoute('trending', <TrendingPage />)}
          {chainRoute('new-pairs', <NewPairsPage />)}
          {chainRoute('narratives', <NarrativesPage />)}
          {chainRoute('token/:address', <TokenPage />)}
          {chainRoute('address/:address', <WalletPage />)}
          {chainRoute('leaderboard', <LeaderboardPage />)}
          {chainRoute('monitor', <MonitorPage />)}
          {chainRoute('signals', <SignalsPage />)}
          {chainRoute('copytrade', <CopyTradePage />)}
          {chainRoute('sniper', <SniperPage />)}
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/watchlist" element={<WatchlistPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/rewards" element={<RewardsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/_ui" element={<UiGalleryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
