// The route table: one row per page, rendered by App in this order. Add a page
// by appending a row (pages are lazy-loaded into their own chunk). Chain-scoped
// rows live under /:chain/ behind ChainGuard; the others are absolute paths.

import { lazy, type ComponentType, type ReactNode } from 'react';
import { DemoOnly, RootRedirect } from '@/routeGuards';

export interface AppRoute {
  /** Below `/:chain/` when chainScoped (e.g. 'token/:address'), else the full path. */
  path: string;
  /** The page (lazy-loaded, except the root redirect). */
  component: ComponentType;
  /** Mounted under `/:chain/` inside ChainGuard, which validates the chain and remembers it. */
  chainScoped: boolean;
  /** Wraps the page inside ChainGuard, e.g. DemoOnly for pages the live deployment does not offer. */
  guard?: ComponentType<{ children: ReactNode }>;
}

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
const LaunchPage = lazy(() => import('@/pages/LaunchPage'));
const CalloutsPage = lazy(() => import('@/pages/CalloutsPage'));
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage'));
const WatchlistPage = lazy(() => import('@/pages/WatchlistPage'));
const AlertsPage = lazy(() => import('@/pages/AlertsPage'));
const RewardsPage = lazy(() => import('@/pages/RewardsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));
const UiGalleryPage = lazy(() => import('@/pages/UiGalleryPage'));

export const ROUTES: AppRoute[] = [
  { path: '/', component: RootRedirect, chainScoped: false },
  { path: 'trenches', component: TrenchesPage, chainScoped: true },
  { path: 'trending', component: TrendingPage, chainScoped: true },
  { path: 'new-pairs', component: NewPairsPage, chainScoped: true },
  { path: 'narratives', component: NarrativesPage, chainScoped: true },
  { path: 'token/:address', component: TokenPage, chainScoped: true },
  { path: 'address/:address', component: WalletPage, chainScoped: true },
  { path: 'leaderboard', component: LeaderboardPage, chainScoped: true },
  { path: 'monitor', component: MonitorPage, chainScoped: true },
  { path: 'signals', component: SignalsPage, chainScoped: true },
  { path: 'copytrade', component: CopyTradePage, chainScoped: true },
  { path: 'sniper', component: SniperPage, chainScoped: true },
  { path: 'launch', component: LaunchPage, chainScoped: true, guard: DemoOnly },
  { path: 'callouts', component: CalloutsPage, chainScoped: true },
  { path: '/portfolio', component: PortfolioPage, chainScoped: false },
  { path: '/watchlist', component: WatchlistPage, chainScoped: false },
  { path: '/alerts', component: AlertsPage, chainScoped: false },
  { path: '/rewards', component: RewardsPage, chainScoped: false },
  { path: '/settings', component: SettingsPage, chainScoped: false },
  { path: '/_ui', component: UiGalleryPage, chainScoped: false },
  // Unmatched paths (React Router ranks routes by specificity, so rows appended below still match first).
  { path: '*', component: NotFoundPage, chainScoped: false },
];

/** The row's full path: chain-scoped rows live under `/:chain/`. */
export const routePath = (r: AppRoute) => (r.chainScoped ? `/:chain/${r.path}` : r.path);
