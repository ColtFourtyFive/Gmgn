// Helpers shared by the specs: picking live simulator data through the API
// (tests never assume specific tokens or wallets) and common UI steps.

import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { LeaderboardRow, TokenSummary, TrendingSnapshot } from '@trenchscope/shared';
import { expect } from './fixtures';

export const CHAIN = 'sol';

async function getJson<T>(request: APIRequestContext, url: string): Promise<T> {
  const res = await request.get(url);
  expect(res.ok(), `GET ${url}: ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Most active tokens on the chain right now. */
export async function trendingTokens(request: APIRequestContext): Promise<TokenSummary[]> {
  const snap = await getJson<TrendingSnapshot>(request, `/api/${CHAIN}/trending?window=1h&limit=100`);
  expect(snap.tokens.length, 'trending tokens').toBeGreaterThan(0);
  return snap.tokens;
}

/**
 * A token that is safe to paper-trade in a test: migrated to its AMM pool
 * (no curve completion mid-trade), low risk (no risk gate), with liquidity,
 * most actively traded first.
 */
export async function pickTradableToken(request: APIRequestContext): Promise<TokenSummary> {
  const tokens = await trendingTokens(request);
  const ok = (t: TokenSummary) => t.security.riskLevel !== 'high' && t.security.isHoneypot !== true && t.liquidityUsd > 3_000;
  const ranked = [...tokens].sort((a, b) => b.stats['1h'].swaps - a.stats['1h'].swaps);
  const pick = ranked.find((t) => ok(t) && t.status === 'migrated' && (t.security.lpBurnedRate ?? 0) >= 1) ?? ranked.find((t) => ok(t) && t.status === 'migrated') ?? ranked.find(ok);
  expect(pick, 'a tradable token').toBeTruthy();
  return pick!;
}

/** KOL wallets ranked on the leaderboard (KOLs are seeded, so they exist from the start). */
export async function kolWallets(request: APIRequestContext): Promise<LeaderboardRow[]> {
  const rows = await getJson<LeaderboardRow[]>(request, `/api/${CHAIN}/leaderboard?tag=kol&period=7d`);
  expect(rows.length, 'KOL leaderboard rows').toBeGreaterThan(0);
  return rows;
}

/** Parse the first number in a UI string ("49.49 SOL", "$1,234.5"). */
export function parseAmount(text: string | null): number {
  const m = (text ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) throw new Error(`no number in "${text}"`);
  return Number(m[0]);
}

/** Paper wallet balance pill in the top bar. */
export function balancePill(page: Page): Locator {
  return page.getByRole('banner').getByTitle('Paper wallet balance');
}

export async function readBalance(page: Page): Promise<number> {
  await expect(balancePill(page)).toBeVisible();
  return parseAmount(await balancePill(page).textContent());
}

/** A toast (success / info toasts are role=status, errors role=alert) containing `text`. */
export function toast(page: Page, text: string | RegExp, kind: 'status' | 'alert' = 'status'): Locator {
  return page.getByRole(kind).filter({ hasText: text });
}

/** Keep the pointer off the Trenches columns (hovering a column pauses it). */
export async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(1, 1);
}

/**
 * Text of the first `n` items of a live list, without relative ages (which
 * tick client-side every second): changes only when the data changes.
 */
export async function listSignature(list: Locator, n = 12): Promise<string> {
  return list.evaluate((el, max) => {
    const items = Array.from(el.children).slice(0, max);
    return items
      .map((item) => {
        const copy = item.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('time').forEach((t) => t.remove());
        return copy.textContent ?? '';
      })
      .join('|');
  }, n);
}

/** Wait until the app shell has booted and the signed-in account is shown. */
export async function expectSignedIn(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Token page
// ---------------------------------------------------------------------------

export async function openToken(page: Page, token: Pick<TokenSummary, 'address' | 'symbol'>): Promise<void> {
  await page.goto(`/${CHAIN}/token/${token.address}`);
  await expect(page.getByRole('heading', { level: 1, name: token.symbol, exact: true })).toBeVisible();
}

/** Phones show the token page in tabs: switch to one (no-op on wider layouts). */
export async function tokenSection(page: Page, isMobile: boolean, name: 'Chart' | 'Trade' | 'Info' | 'Activity'): Promise<void> {
  if (!isMobile) return;
  const tab = page.getByRole('tablist', { name: 'Token sections' }).getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

export function tradePanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Trade' });
}

/** The bottom tabs (activity, holders, orders...) of the token page. */
export function tokenDetails(page: Page): Locator {
  return page.getByRole('region', { name: 'Token activity' });
}

/** Rows of a DataTable that hold data (not the skeleton or empty-state rows). */
export function dataRows(table: Locator): Locator {
  return table.locator('tbody > tr').filter({ has: table.page().locator('td:not([colspan])') }).filter({ hasNot: table.page().locator('.skeleton') });
}

/**
 * Get through the safety-gate / confirm dialog when a trade asks for one: a
 * high-risk token (acknowledge, then "Buy anyway"), a soft gate such as price
 * impact or fees ("Buy / Sell anyway"), or "Confirm trades". A token's risk
 * and the quote can change live, so any trade may ask.
 */
export async function passTradeGate(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: /High-risk token|Confirm (buy|sell)|Check this (buy|sell)|Check before you trade/ });
  const outcome = toast(page, /^(Bought|Sold) /).or(page.getByRole('alert')).or(dialog);
  await expect(outcome.first()).toBeVisible();
  if (await dialog.isVisible()) {
    const ack = dialog.getByRole('checkbox');
    if ((await ack.count()) && !(await ack.isChecked())) {
      // The styled checkbox hides its native input; tick it the way a user does, via its label.
      await dialog.locator('label').filter({ has: page.getByRole('checkbox') }).click();
      await expect(ack).toBeChecked();
    }
    await dialog.getByRole('button', { name: /(Buy|Sell) anyway|Confirm (buy|sell)|^(Buy|Sell)$/ }).click();
  }
}

/** Click a buy/sell submit button, then get through the gate / confirm dialog it may open. */
export async function submitTrade(page: Page, button: Locator): Promise<void> {
  await button.click();
  await passTradeGate(page);
}
