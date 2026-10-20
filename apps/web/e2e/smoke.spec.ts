// Smoke: every route renders (signed in and anonymous) without console errors
// or uncaught exceptions, and nothing overflows horizontally at phone width.

import type { APIRequestContext, Page } from '@playwright/test';
import { createGuest, expect, signIn, test, type PageIssues } from './fixtures';
import { CHAIN, kolWallets, trendingTokens } from './helpers';

type RouteSpec = {
  name: string;
  path: (request: APIRequestContext) => Promise<string> | string;
  /** The UI gallery shows loading skeletons on purpose. */
  showsSkeletons?: boolean;
};

const ROUTES: RouteSpec[] = [
  { name: 'root redirect', path: () => '/' },
  { name: 'trenches', path: () => `/${CHAIN}/trenches` },
  { name: 'trending', path: () => `/${CHAIN}/trending` },
  { name: 'new pairs', path: () => `/${CHAIN}/new-pairs` },
  { name: 'narratives', path: () => `/${CHAIN}/narratives` },
  { name: 'token', path: async (request) => `/${CHAIN}/token/${(await trendingTokens(request))[0].address}` },
  { name: 'wallet', path: async (request) => `/${CHAIN}/address/${(await kolWallets(request))[0].address}` },
  { name: 'leaderboard', path: () => `/${CHAIN}/leaderboard` },
  { name: 'monitor', path: () => `/${CHAIN}/monitor` },
  { name: 'signals', path: () => `/${CHAIN}/signals` },
  { name: 'copy trade', path: () => `/${CHAIN}/copytrade` },
  { name: 'sniper', path: () => `/${CHAIN}/sniper` },
  { name: 'launch', path: () => `/${CHAIN}/launch` },
  { name: 'callouts', path: () => `/${CHAIN}/callouts` },
  { name: 'portfolio', path: () => '/portfolio' },
  { name: 'watchlist', path: () => '/watchlist' },
  { name: 'alerts', path: () => '/alerts' },
  { name: 'rewards', path: () => '/rewards' },
  { name: 'settings', path: () => '/settings' },
  { name: 'ui gallery', path: () => '/_ui', showsSkeletons: true },
  { name: 'not found', path: () => '/no-such-page' },
  { name: 'other chain', path: () => '/bsc/trenches' },
];

/** Rendered: a page heading, no loading placeholders left, requests settled. */
async function expectRendered(page: Page, route: RouteSpec): Promise<void> {
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(main.getByText('Loading…', { exact: true })).toHaveCount(0);
  if (!route.showsSkeletons) await expect(main.locator('.skeleton')).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector('main');
    // Elements wider than the viewport that are not inside a horizontal scroller (tables scroll on purpose).
    const offenders: string[] = [];
    const vw = doc.clientWidth;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1) continue;
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') && p.getBoundingClientRect().right <= vw + 1) {
          clipped = true;
          break;
        }
      }
      if (!clipped && getComputedStyle(el).position !== 'fixed') offenders.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)} → ${Math.round(r.right)}px`);
    }
    return {
      document: doc.scrollWidth - doc.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
      offenders: offenders.slice(0, 5),
    };
  });
  expect(overflow.document, 'document scrolls horizontally').toBeLessThanOrEqual(0);
  expect(overflow.main, 'main content is wider than the viewport (clipped)').toBeLessThanOrEqual(0);
  expect(overflow.offenders, 'elements sticking out past the viewport').toEqual([]);
}

function expectNoConsoleErrors(issues: PageIssues): void {
  expect(issues.consoleErrors, 'console errors').toEqual([]);
}

for (const signedIn of [true, false]) {
  test.describe(signedIn ? 'smoke (signed in)' : 'smoke (anonymous)', () => {
    for (const route of ROUTES) {
      test(`${route.name} renders`, async ({ page, request, issues, isMobile }) => {
        if (signedIn) await signIn(page, await createGuest(request));
        const path = await route.path(request);
        await page.goto(path);
        await expectRendered(page, route);
        const banner = page.getByRole('banner');
        if (signedIn) await expect(banner.getByRole('button', { name: 'Account menu' })).toBeVisible();
        else await expect(banner.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
        expectNoConsoleErrors(issues);
        if (isMobile) await expectNoHorizontalOverflow(page);
      });
    }
  });
}
