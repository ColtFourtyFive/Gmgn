// Launch: create a token on a launchpad, land on its page, and watch the
// simulated market trade it.

import { expect, test } from './fixtures';
import { CHAIN, dataRows, readBalance, toast, tokenDetails, tokenSection } from './helpers';

test('launch a token, land on its page and see it trade', async ({ page, guest, isMobile }) => {
  const ticker = `E2E${Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
  const name = `Playwright ${ticker}`;

  await page.goto(`/${CHAIN}/launch`);
  await expect(page.getByRole('heading', { level: 1, name: 'Launch a token' })).toBeVisible();
  const start = await readBalance(page);
  await expect(page.getByRole('radiogroup', { name: 'Launchpad' }).getByRole('radio', { checked: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Ticker', { exact: true }).fill(ticker);
  await page.getByLabel('Description (optional)').fill('Launched by the end-to-end suite.');

  await page.getByRole('button', { name: `Launch $${ticker}`, exact: true }).click();
  const confirm = page.getByRole('dialog', { name: `Launch $${ticker}?` });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: `Launch $${ticker}`, exact: true }).click();

  await expect(toast(page, new RegExp(`^\\$${ticker} is live on `))).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${CHAIN}/token/[A-Za-z0-9]+$`));
  await expect(page.getByRole('heading', { level: 1, name: ticker, exact: true })).toBeVisible();
  // Launch fee + dev buy were paid from the paper wallet.
  await expect.poll(() => readBalance(page)).toBeLessThan(start);

  // The dev buy is the first trade; the simulated market joins in after it.
  await tokenSection(page, isMobile, 'Activity');
  const trades = dataRows(tokenDetails(page).getByRole('table', { name: `${ticker} trades` }));
  await expect(trades.first()).toBeVisible();
  await expect.poll(() => trades.count(), { timeout: 40_000, message: 'other traders trade the new token' }).toBeGreaterThan(1);
});
