// Settings: change a slippage preset and the theme; both persist across a
// reload and live in the account (not just this browser).

import type { UserSettings } from '@trenchscope/shared';
import { expect, test } from './fixtures';
import { toast } from './helpers';

test('slippage preset and theme persist after reload', async ({ page, guest }) => {
  await page.goto('/settings');
  const sections = page.getByRole('tablist', { name: 'Settings sections' });
  await expect(sections.getByRole('tab', { name: 'Trading' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Chain' }).getByRole('radio', { name: /Solana/ })).toHaveAttribute('aria-checked', 'true');

  const slippage = page.getByLabel('P2 buy slippage');
  await expect(slippage).toHaveValue('25');
  await slippage.fill('30');
  await slippage.blur();
  const save = page.getByRole('main').getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(toast(page, 'Settings saved')).toBeVisible();
  await expect(save).toBeDisabled();

  await sections.getByRole('tab', { name: 'Display' }).click();
  const theme = page.getByRole('radiogroup', { name: 'Theme' });
  await expect(theme.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
  await theme.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Saved to the account.
  await expect
    .poll(async () => {
      const s = (await (await page.request.get('/api/settings', { headers: guest.headers })).json()) as UserSettings;
      return { slippage: s.trade.sol.buyPresets.P2.slippage, theme: s.display.theme };
    })
    .toEqual({ slippage: 0.3, theme: 'light' });

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(theme.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  await sections.getByRole('tab', { name: 'Trading' }).click();
  await expect(page.getByLabel('P2 buy slippage')).toHaveValue('30');

  // Without this browser's local copy, the theme still comes from the account.
  await page.evaluate(() => localStorage.removeItem('ts.theme'));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
