// Navigation model shared by the top bar, the mobile tab bar and the drawer.

import { isChainId, type ChainId } from '@trenchscope/shared';
import { Bell, Crosshair, Flame, Gift, Layers, Radar, Radio, Repeat2, Settings, Sparkles, Star, TrendingUp, Trophy, Wallet, type LucideIcon } from 'lucide-react';
import { routes } from '@/lib/chain';

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  href: (chain: ChainId) => string;
  /** Route section that marks the item active (second path segment, or first for global routes). */
  section: string;
}

/** Primary sections in priority order (later items collapse into "More" first). */
export const NAV_ITEMS: NavItem[] = [
  { key: 'trenches', label: 'Trenches', icon: Flame, href: routes.trenches, section: 'trenches' },
  { key: 'trending', label: 'Trending', icon: TrendingUp, href: routes.trending, section: 'trending' },
  { key: 'new-pairs', label: 'New Pairs', icon: Sparkles, href: routes.newPairs, section: 'new-pairs' },
  { key: 'monitor', label: 'Monitor', icon: Radar, href: routes.monitor, section: 'monitor' },
  { key: 'signals', label: 'Signals', icon: Radio, href: routes.signals, section: 'signals' },
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy, href: routes.leaderboard, section: 'leaderboard' },
  { key: 'copytrade', label: 'Copy Trade', icon: Repeat2, href: routes.copytrade, section: 'copytrade' },
  { key: 'sniper', label: 'Sniper', icon: Crosshair, href: routes.sniper, section: 'sniper' },
  { key: 'portfolio', label: 'Portfolio', icon: Wallet, href: () => routes.portfolio(), section: 'portfolio' },
  { key: 'narratives', label: 'Narratives', icon: Layers, href: routes.narratives, section: 'narratives' },
];

/** Bottom tab bar on phones (the rest lives in the "More" drawer). */
export const MOBILE_TABS = ['trenches', 'trending', 'monitor', 'portfolio'].map((k) => NAV_ITEMS.find((n) => n.key === k)!);

/** Account menu entries (global routes). */
export const ACCOUNT_ITEMS: { key: string; label: string; icon: LucideIcon; href: string }[] = [
  { key: 'portfolio', label: 'Portfolio', icon: Wallet, href: routes.portfolio() },
  { key: 'watchlist', label: 'Watchlist', icon: Star, href: routes.watchlist() },
  { key: 'alerts', label: 'Alerts', icon: Bell, href: routes.alerts() },
  { key: 'rewards', label: 'Rewards', icon: Gift, href: routes.rewards() },
  { key: 'settings', label: 'Settings', icon: Settings, href: routes.settings() },
];

/** Active section of a pathname: "/sol/trending" -> "trending", "/portfolio" -> "portfolio". */
export function activeSection(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  return (isChainId(parts[0]) ? parts[1] : parts[0]) ?? null;
}

/**
 * Where the chain switcher goes: same section on the new chain
 * (/sol/trending -> /bsc/trending); token/address pages fall back to the
 * new chain's trenches; global routes stay put (null).
 */
export function switchChainPath(pathname: string, chain: ChainId): string | null {
  const parts = pathname.split('/').filter(Boolean);
  if (!isChainId(parts[0])) return null;
  const section = parts[1];
  if (!section || section === 'token' || section === 'address') return routes.trenches(chain);
  return `/${chain}/${section}`;
}
