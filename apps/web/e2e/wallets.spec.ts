// Wallets & Monitor: follow a wallet from the leaderboard, find it under
// Following, and watch the live trade feed stream.

import { expect, test } from './fixtures';
import { CHAIN, dataRows, listSignature, parkPointer, toast } from './helpers';

test('follow a wallet from the leaderboard and see it in Following', async ({ page, guest, isMobile }) => {
  await page.goto(`/${CHAIN}/leaderboard`);
  const category = page.getByRole('tablist', { name: 'Wallet category' }).getByRole('tab', { name: 'KOL' });
  await category.click();
  await expect(category).toHaveAttribute('aria-selected', 'true');

  const table = page.getByRole('table', { name: 'KOL leaderboard' });
  const row = dataRows(table).first();
  const follow = row.getByRole('button', { name: /^Follow / });
  await expect(follow).toBeVisible();
  const name = ((await follow.getAttribute('aria-label')) ?? '').replace(/^Follow /, '');
  expect(name).not.toBe('');

  // The leaderboard re-ranks live, so address the wallet by name, not by row position.
  await table.getByRole('button', { name: `Follow ${name}`, exact: true }).first().click();
  await expect(toast(page, `Following ${name}`)).toBeVisible();
  await expect(table.getByRole('button', { name: `Following ${name} — edit` }).first()).toBeVisible();

  await page.goto(`/${CHAIN}/monitor`);
  if (isMobile) await page.getByRole('radiogroup', { name: 'Monitor section' }).getByRole('radio', { name: /^Following/ }).click();
  else await expect(page.getByRole('tablist', { name: 'Feed' }).getByRole('tab', { name: 'Following 1' })).toBeVisible();
  await expect(page.getByRole('link', { name, exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: `Unfollow ${name}` })).toBeVisible();

  // Unfollow from the panel.
  await page.getByRole('button', { name: `Unfollow ${name}` }).click();
  await expect(toast(page, `Unfollowed ${name}`)).toBeVisible();
  await expect(page.getByText('No followed wallets yet')).toBeVisible();
});

test('monitor feed rows stream in live', async ({ page }) => {
  await page.goto(`/${CHAIN}/monitor`);
  await parkPointer(page);
  const tab = page.getByRole('tablist', { name: 'Feed' }).getByRole('tab', { name: 'All' });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');

  const list = page.getByRole('list', { name: 'All trades' });
  await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
  const before = await listSignature(list, 5);
  await expect.poll(() => listSignature(list, 5), { timeout: 25_000, message: 'new trades arrive at the top' }).not.toBe(before);
  expect(await list.getByRole('listitem').count()).toBeGreaterThan(1);
});
