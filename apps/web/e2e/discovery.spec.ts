// Discovery: the live Trenches board, column filter presets, the Trending
// window switch and keyboard quick-buy.

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { CHAIN, listSignature, parkPointer, passTradeGate, readBalance, toast } from './helpers';

const LIVE_TIMEOUT = 25_000;

function column(page: Page, name: 'New' | 'Almost bonded' | 'Migrated'): Locator {
  return page.getByRole('main').getByRole('region', { name, exact: true });
}

function columnList(page: Page, name: 'New' | 'Almost bonded' | 'Migrated'): Locator {
  return column(page, name).getByRole('list', { name: `${name} tokens` });
}

/** Phones show one Trenches column at a time, behind tabs. */
async function showColumn(page: Page, isMobile: boolean, tab: 'New' | 'Almost' | 'Migrated'): Promise<void> {
  if (!isMobile) return;
  const t = page.getByRole('tablist', { name: 'Trenches columns' }).getByRole('tab', { name: new RegExp(`^${tab}\\b`) });
  await t.click();
  await expect(t).toHaveAttribute('aria-selected', 'true');
}

async function expectListChanges(list: Locator): Promise<void> {
  await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: LIVE_TIMEOUT });
  const before = await listSignature(list);
  await expect.poll(() => listSignature(list), { timeout: LIVE_TIMEOUT, message: 'column content updates live' }).not.toBe(before);
}

test('trenches columns receive live updates', async ({ page, isMobile }) => {
  await page.goto(`/${CHAIN}/trenches`);
  await parkPointer(page);
  await expect(page.getByRole('main').getByRole('status').filter({ hasText: 'Live' })).toBeVisible();

  await showColumn(page, isMobile, 'New');
  await expectListChanges(columnList(page, 'New'));

  await showColumn(page, isMobile, 'Almost');
  await expectListChanges(columnList(page, 'Almost bonded'));
});

test('a filter preset changes the column results', async ({ page }) => {
  await page.goto(`/${CHAIN}/trenches`);
  const list = columnList(page, 'New');
  await expect(list.getByRole('listitem').first()).toBeVisible();
  const before = await list.getByRole('listitem').count();

  await column(page, 'New').getByRole('button', { name: 'New filters', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'New filters' });
  await expect(drawer).toBeVisible();
  const strict = drawer.getByRole('button', { name: 'Strict' });
  await strict.click();
  await expect(strict).toHaveAttribute('aria-pressed', 'true');
  await drawer.getByRole('button', { name: /^Apply \(\d+\)$/ }).click();
  await expect(drawer).toBeHidden();
  await parkPointer(page);

  // The filter is applied server-side: fewer tokens, or none at all.
  const filterButton = column(page, 'New').getByRole('button', { name: /^New filters \(\d+ active\)$/ });
  await expect(filterButton).toBeVisible();
  const empty = column(page, 'New').getByText('No tokens match your filters');
  await expect
    .poll(async () => ((await empty.isVisible()) ? 0 : await list.getByRole('listitem').count()), { timeout: LIVE_TIMEOUT })
    .toBeLessThan(before);

  // Survives a reload (saved per chain and column) and can be reset.
  await page.reload();
  await expect(filterButton).toBeVisible();
  await filterButton.click();
  await drawer.getByRole('button', { name: 'Reset' }).click();
  await drawer.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(column(page, 'New').getByRole('button', { name: 'New filters', exact: true })).toBeVisible();
  await expect(list.getByRole('listitem').first()).toBeVisible();
});

test('trending window switch re-ranks for the new window', async ({ page }) => {
  await page.goto(`/${CHAIN}/trending`);
  const table = page.getByRole('table', { name: 'Trending tokens' });
  const windows = page.getByRole('radiogroup', { name: 'Ranking window' });
  await expect(windows.getByRole('radio', { name: '1h' })).toHaveAttribute('aria-checked', 'true');
  await expect(table.getByRole('columnheader', { name: 'Vol 1h' })).toBeVisible();
  await expect(table.getByRole('link').first()).toBeVisible();

  await windows.getByRole('radio', { name: '5m' }).click();
  await expect(windows.getByRole('radio', { name: '5m' })).toHaveAttribute('aria-checked', 'true');
  await expect(table.getByRole('columnheader', { name: 'Vol 5m' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Vol 1h' })).toHaveCount(0);
  await expect(table.getByRole('link').first()).toBeVisible();

  // The choice is remembered.
  await page.reload();
  await expect(windows.getByRole('radio', { name: '5m' })).toHaveAttribute('aria-checked', 'true');
});

test('hotkeys select a token; B quick-buys it once trading hotkeys are turned on', async ({ page, guest, isMobile }) => {
  test.skip(isMobile, 'keyboard trading is a desktop feature');
  await page.goto(`/${CHAIN}/trenches`);
  await parkPointer(page);
  const list = columnList(page, 'New');
  await expect(list.getByRole('listitem').first()).toBeVisible();
  const balance = await readBalance(page);

  // 1 focuses the New column and selects its first card.
  await page.keyboard.press('1');
  const selected = list.locator('li[aria-current="true"]');
  await expect(selected).toHaveCount(1);
  const symbol = (await selected.getByRole('link').first().textContent())?.trim() ?? '';
  expect(symbol).not.toBe('');
  await expect(column(page, 'New').getByRole('status').filter({ hasText: 'Paused' })).toBeVisible();

  // Trading hotkeys are opt-in (off by default): B does not buy yet.
  await page.keyboard.press('b');
  await page.waitForTimeout(500);
  await expect(toast(page, `Bought ${symbol}`)).toHaveCount(0);

  // Turn them on from the shortcut sheet; B then quick-buys the selected card with the quick-buy amount.
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.getByRole('switch', { name: /Trading hotkeys/ }).click();
  await page.keyboard.press('Escape');
  await parkPointer(page);
  await expect(selected).toHaveCount(1);
  await page.keyboard.press('b');
  // A new launch may trip a safety gate (high risk, price impact): B asks like the ⚡ button then.
  await passTradeGate(page);
  await expect(toast(page, `Bought ${symbol}`)).toBeVisible();
  await expect.poll(() => readBalance(page)).toBeLessThan(balance);

  // Escape clears the selection and the column resumes.
  await page.keyboard.press('Escape');
  await expect(selected).toHaveCount(0);
});
