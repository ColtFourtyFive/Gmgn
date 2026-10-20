// Auth: one-click guest account, upgrading that guest to a registered account
// in place (balances carry over), referral links, and signing out (guests
// confirm first).

import { expect, test } from './fixtures';
import { balancePill, CHAIN, expectSignedIn, readBalance, toast } from './helpers';

test('guest quick start creates a funded paper account', async ({ page }) => {
  await page.goto(`/${CHAIN}/trenches`);
  await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Start trading on Trenchscope' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Quick start' })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('button', { name: 'Start paper trading' }).click();

  await expect(dialog).toBeHidden();
  await expect(toast(page, /^Welcome, guest_/)).toBeVisible();
  await expectSignedIn(page);
  await expect(balancePill(page)).toBeVisible();
  expect(await readBalance(page)).toBeGreaterThan(0);

  // The session survives a reload (token kept in this browser).
  await page.reload();
  await expectSignedIn(page);
});

test('a guest registers and keeps the same account', async ({ page, guest }) => {
  await page.goto(`/${CHAIN}/trenches`);
  await expectSignedIn(page);
  const balance = await readBalance(page);

  await page.getByRole('button', { name: 'Account menu' }).click();
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(page.getByText(/^Guest account · code /)).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Register account' }).click();

  const dialog = page.getByRole('dialog', { name: 'Keep your paper account' });
  await expect(dialog).toBeVisible();
  const username = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.slice(0, 24);
  await dialog.getByLabel('Username').fill(username);
  await dialog.getByLabel('Password').fill('correct-horse-42');
  await dialog.getByRole('button', { name: 'Create account' }).click();

  await expect(dialog).toBeHidden();
  await expect(toast(page, `Welcome, ${username}`)).toBeVisible();
  expect(await readBalance(page)).toBeCloseTo(balance, 6);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByText(/^Paper account · code /)).toBeVisible();
  await expect(page.getByText(username, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Register account' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Upgraded in place: same account id, now with credentials.
  const me = await page.request.get('/api/me', { headers: guest.headers });
  expect(me.ok()).toBeTruthy();
  const account = await me.json();
  expect(account.id).toBe(guest.account.id);
  expect(account.username).toBe(username);
  expect(account.isGuest).toBe(false);
});

test('a referral link pre-fills the code through the root redirect', async ({ page, request }) => {
  const referrer = await (await request.post('/api/auth/guest', { data: {} })).json();
  const code: string = referrer.account.referralCode;
  await page.goto(`/?ref=${code}`);
  await expect(page).toHaveURL(new RegExp(`/trenches\\?ref=${code}$`));
  // Browsing before signing up keeps the code too.
  await page.goto(`/${CHAIN}/trending`);
  await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Start trading on Trenchscope' });
  await dialog.getByRole('tab', { name: 'Register' }).click();
  await expect(dialog.getByLabel('Referral code (optional)')).toHaveValue(code);
  await dialog.getByRole('tab', { name: 'Quick start' }).click();
  await dialog.getByRole('button', { name: 'Start paper trading' }).click();
  await expectSignedIn(page);
  const token = await page.evaluate(() => localStorage.getItem('ts.token'));
  const me = await (await request.get('/api/me', { headers: { authorization: `Bearer ${token}` } })).json();
  expect(me.referredBy).toBeTruthy();
});

test('signing out returns to the anonymous shell', async ({ page }) => {
  // Sign in through the UI so this test owns the whole session lifecycle.
  await page.goto(`/${CHAIN}/trending`);
  await page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start paper trading' }).click();
  await expectSignedIn(page);

  // A guest account cannot be recovered once signed out: the menu asks first.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Sign out' }).click();
  let confirm = page.getByRole('dialog', { name: 'Sign out of this guest account?' });
  await expect(confirm).toContainText('cannot be recovered');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toBeHidden();
  await expectSignedIn(page);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menu', { name: 'Account' }).getByRole('menuitem', { name: 'Sign out' }).click();
  confirm = page.getByRole('dialog', { name: 'Sign out of this guest account?' });
  await confirm.getByRole('button', { name: 'Sign out', exact: true }).click();

  await expect(toast(page, 'Signed out')).toBeVisible();
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Account menu' })).toHaveCount(0);
  await expect(balancePill(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ts.token'))).toBeNull();

  // Still signed out after a reload.
  await page.reload();
  await expect(banner.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
