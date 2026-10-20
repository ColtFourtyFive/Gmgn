// Command palette: open it (Ctrl+K, or the header button on phones), find a
// live token by its symbol with the keyboard and open its page.

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { CHAIN, trendingTokens } from './helpers';

async function openPalette(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('banner').getByRole('button', { name: /^Command palette/ }).click();
  else await page.keyboard.press('Control+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  return palette;
}

test('Ctrl+K (the header button on phones) opens a token by its symbol', async ({ page, request, isMobile }) => {
  const token = (await trendingTokens(request))[0];
  await page.goto(`/${CHAIN}/trending`);
  await expect(page.getByRole('heading', { level: 1, name: 'Trending' })).toBeVisible();

  const palette = await openPalette(page, isMobile);
  const input = palette.getByRole('combobox', { name: 'Search pages, actions, tokens and wallets' });
  await expect(input).toBeFocused();
  await input.fill(token.symbol);

  // Symbols are not unique: pick the entry of this token (its name is shown with the symbol).
  const option = palette.getByRole('group', { name: 'Tokens' }).getByRole('option').filter({ hasText: token.name }).first();
  await expect(option).toBeVisible();
  for (let i = 0; i < 30 && (await option.getAttribute('aria-selected')) !== 'true'; i++) await input.press('ArrowDown');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');

  await expect(palette).toBeHidden();
  await expect(page).toHaveURL(`/${CHAIN}/token/${token.address}`);
  await expect(page.getByRole('heading', { level: 1, name: token.symbol, exact: true })).toBeVisible();

  // The pick is remembered under Recent.
  const again = await openPalette(page, isMobile);
  await expect(again.getByRole('group', { name: 'Recent' }).getByRole('option').filter({ hasText: token.name })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(again).toBeHidden();
});

test('the palette runs page commands', async ({ page, isMobile }) => {
  await page.goto(`/${CHAIN}/trenches`);
  await expect(page.getByRole('heading', { level: 1, name: 'Trenches' })).toBeVisible();
  const palette = await openPalette(page, isMobile);
  const input = palette.getByRole('combobox');
  await input.fill('leaderboard');
  await expect(palette.getByRole('group', { name: 'Commands' }).getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await expect(palette.getByRole('group', { name: 'Commands' }).getByRole('option').first()).toContainText('Leaderboard');
  await input.press('Enter');
  await expect(page).toHaveURL(`/${CHAIN}/leaderboard`);
  await expect(page.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeVisible();
});
