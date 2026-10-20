// Automation: copy-trade tasks, snipers and price alerts, and the
// notification bell they feed.

import { expect, test } from './fixtures';
import { CHAIN, kolWallets, pickTradableToken, toast } from './helpers';

test('create a copy-trade task', async ({ page, request, guest }) => {
  const target = (await kolWallets(request))[0];
  await page.goto(`/${CHAIN}/copytrade`);
  await page.getByRole('button', { name: 'New copy task' }).first().click();

  const drawer = page.getByRole('dialog', { name: 'New copy task' });
  await expect(drawer).toBeVisible();
  await drawer.getByLabel('Target address').fill(target.address);
  await drawer.getByLabel('Label (optional)').fill('E2E copy');
  await drawer.getByRole('button', { name: 'Start copying' }).click();

  await expect(drawer).toBeHidden();
  await expect(toast(page, 'Copy task started')).toBeVisible();
  const card = page.getByRole('article', { name: 'Copy task E2E copy' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('switch', { name: 'Pause copy task' })).toBeChecked();

  await page.reload();
  await expect(card).toBeVisible();
});

test('arm a sniper; its snipes show up in the notification bell', async ({ page, guest }) => {
  await page.goto(`/${CHAIN}/sniper`);
  await page.getByRole('button', { name: 'New sniper' }).first().click();

  const drawer = page.getByRole('dialog', { name: 'New sniper' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('radiogroup', { name: 'Sniper type' }).getByRole('radio', { checked: true })).toHaveText(/New launches/);
  await drawer.getByLabel('Label (optional)').fill('E2E sniper');
  // Match more launches so the first snipe comes quickly.
  await drawer.getByRole('switch', { name: 'Require socials' }).uncheck();
  await drawer.getByRole('button', { name: 'Arm sniper' }).click();

  await expect(drawer).toBeHidden();
  await expect(toast(page, 'Sniper armed')).toBeVisible();
  await expect(page.getByRole('article', { name: 'Sniper E2E sniper' })).toBeVisible();

  // An unfiltered launch sniper fires on the next launch: the bell counts it.
  const bell = page.getByRole('banner').getByRole('button', { name: /^Notifications \(\d+ unread\)$/ });
  await expect(bell).toBeVisible({ timeout: 45_000 });
  await bell.click();
  const panel = page.getByRole('dialog', { name: 'Notifications' });
  await expect(panel.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  const item = panel.getByRole('listitem').filter({ hasText: /Snip(ed|e failed) \$/ }).first();
  await expect(item).toBeVisible();

  await panel.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});

test('create a price alert', async ({ page, request, guest }) => {
  const token = await pickTradableToken(request);
  await page.goto('/alerts');
  await page.getByRole('button', { name: 'New alert' }).first().click();

  const drawer = page.getByRole('dialog', { name: 'New alert' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Alert type' })).toHaveText(/Price/);
  await drawer.getByLabel('Token address').fill(token.address);
  await expect(drawer.getByText(token.symbol).first()).toBeVisible(); // token preview
  await drawer.getByRole('radiogroup', { name: 'Direction' }).getByRole('radio', { name: 'Goes above' }).click();
  await drawer.getByLabel('Price (USD)').fill(String(Number((token.priceUsd * 3).toPrecision(4))));
  await drawer.getByRole('button', { name: 'Create alert' }).click();

  await expect(drawer).toBeHidden();
  await expect(toast(page, 'Alert created')).toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Alerts sections' });
  await expect(tabs.getByRole('tab', { name: 'Alerts 1' })).toBeVisible();
  await expect(page.getByRole('main').getByText(token.symbol).first()).toBeVisible();
});
