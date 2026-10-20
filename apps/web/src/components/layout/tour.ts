// Onboarding tour content and step resolution (pure, unit-tested). The Tour
// overlay (Tour.tsx) highlights each step's target; run state and the "seen"
// flag live in store/tour.ts.

import type { ChainId } from '@trenchscope/shared';
import type { Placement } from '@/components/ui';
import { routes } from '@/lib/chain';
import { activeSection, tokenRoute } from './nav';

/** Pages with page-specific steps; the tour starts on Trenches from anywhere else. */
export type TourPage = 'trenches' | 'token' | 'other';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Copy for the phone tour when the desktop copy mentions hover or hotkeys. */
  phoneBody?: string;
  /** Copy for the live deployment when the demo copy mentions paper wallets or other chains. */
  liveBody?: string;
  /**
   * Selectors of the element to highlight, in order of preference: the first
   * selector with a visible match wins. No match shows the card centered.
   */
  target: string[];
  /** Highlight the bounding box of every visible match of the winning selector. */
  union?: boolean;
  /** Only on this page. */
  page?: Exclude<TourPage, 'other'>;
  /** Left out of the shorter phone tour. */
  desktopOnly?: boolean;
  /** Preferred side of the card (desktop; phones use a bottom sheet). */
  placement?: Placement;
}

const COLUMN_HEADERS = ['New', 'Near graduation', 'Migrated'].map((c) => `main section[aria-label="${c}"] > header`).join(', ');

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'chain',
    title: 'Pick a chain',
    body: 'Solana, BNB Chain, Base or Ethereum: every page follows this switch, and your paper wallet has funds on each.',
    liveBody: 'Trenchscope trades Solana: pump.fun launches and their DEX pools, from your own embedded wallet. Deposit SOL from the account menu to start.',
    // A data hook, not the accessible name: Select names its trigger with aria-labelledby.
    target: ['[data-tour="chain"]'],
    placement: 'bottom-end',
  },
  {
    id: 'columns',
    title: 'The Trenches',
    body: 'New launches, tokens about to bond and fresh migrations stream in live. Hover a column to pause it; each one has its own sort and filters (the funnel).',
    phoneBody: 'New launches, tokens about to bond and fresh migrations stream in live, one tab each, with their own sort and filters (the funnel).',
    target: [`${COLUMN_HEADERS}, main [role="tablist"][aria-label="Trenches columns"]`],
    union: true,
    page: 'trenches',
    placement: 'bottom',
  },
  {
    id: 'quick-buy',
    title: 'Quick buy',
    body: 'The ⚡ button buys instantly with your active preset. Set the amount at the top of the page; with trading hotkeys on, B buys the selected card.',
    phoneBody: 'The ⚡ button buys instantly with your active preset. Set the amount at the top of the page.',
    target: ['main [data-quick-buy]'],
    page: 'trenches',
    placement: 'right',
  },
  {
    id: 'trade',
    title: 'Trade panel',
    body: 'Market, limit and auto orders with presets, take-profit / stop-loss exit plans and a cost preview before every trade.',
    target: ['main section[aria-label="Trade"]', 'main div:has(> button.btn-buy + button.btn-sell)'],
    page: 'token',
    placement: 'left',
  },
  {
    id: 'search',
    title: 'Search and commands',
    body: 'Find any token or wallet, or paste a contract address to trade it. Ctrl/⌘ K opens the command palette: pages, chains and actions.',
    phoneBody: 'Find any token or wallet, or paste a contract address to trade it. The ⌘ button opens the command palette: pages, chains and actions.',
    target: ['[data-tour="search"]'],
    placement: 'bottom',
  },
  {
    id: 'monitor',
    title: 'Monitor',
    body: 'Follow smart money and KOLs: their buys and sells land here live, with the tokens several of them are piling into.',
    // Narrow desktops fold Monitor into the nav's More menu.
    target: ['nav[aria-label="Primary"] a[href$="/monitor"]', 'nav[aria-label="Primary"] button'],
    placement: 'bottom',
  },
  {
    id: 'dock',
    title: 'Instant trade & positions',
    body: 'A floating panel with one-click buys and sells for the token you are viewing (or viewed last) and your open positions. Drag it anywhere; press I to toggle it.',
    target: ['[data-tour="dock"]'],
    desktopOnly: true,
    placement: 'bottom-end',
  },
];

/** Which page-specific steps apply to a pathname. */
export function tourPage(pathname: string): TourPage {
  if (tokenRoute(pathname)) return 'token';
  return activeSection(pathname) === 'trenches' ? 'trenches' : 'other';
}

/** Steps of the tour on a page, desktop or phone (phones get their own copy where a step has one; live its live copy). */
export function resolveTourSteps(steps: TourStep[], ctx: { page: TourPage; mobile: boolean; live?: boolean }): TourStep[] {
  return steps
    .filter((s) => (!s.page || s.page === ctx.page) && !(ctx.mobile && s.desktopOnly))
    .map((s) => (ctx.live && s.liveBody ? { ...s, body: s.liveBody } : ctx.mobile && s.phoneBody ? { ...s, body: s.phoneBody } : s));
}

/** Where a tour started on `pathname` begins: Trenches unless already on a page with its own steps (null = stay). */
export function tourStartPath(pathname: string, chain: ChainId): string | null {
  return tourPage(pathname) === 'other' ? routes.trenches(chain) : null;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Bounding box of several rects (null for none). */
export function unionBox(rects: Box[]): Box | null {
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.top + r.height));
  const right = Math.max(...rects.map((r) => r.left + r.width));
  return { top, left, width: right - left, height: bottom - top };
}

/** Phone sheet edge: away from the highlighted element (bottom unless it sits in the lower half). */
export function sheetEdge(target: Box | null, viewportHeight: number): 'top' | 'bottom' {
  return target && target.top + target.height / 2 > viewportHeight / 2 ? 'top' : 'bottom';
}
