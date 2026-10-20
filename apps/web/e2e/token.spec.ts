// Token page: chart, detail tabs, market buy / sell, limit orders and buying
// with an exit strategy. Trades run against a live, actively traded token.

import type { Order, TokenSummary } from '@trenchscope/shared';
import { expect, test } from './fixtures';
import { dataRows, openToken, pickTradableToken, readBalance, submitTrade, toast, tokenDetails, tokenSection, tradePanel } from './helpers';

let token: TokenSummary;

test.beforeEach(async ({ request }) => {
  token = await pickTradableToken(request);
});

test('chart, holders and top traders load', async ({ page, isMobile }) => {
  await openToken(page, token);

  const chart = page.getByRole('region', { name: `${token.symbol} chart` });
  await expect(chart).toBeVisible();
  const canvas = chart.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);
  // Switch the candle resolution (segmented control; a select on phones).
  if (isMobile) {
    await chart.getByRole('button', { name: 'Candle resolution' }).click();
    await page.getByRole('listbox', { name: 'Candle resolution' }).getByRole('option', { name: '5m', exact: true }).click();
    await expect(chart.getByRole('button', { name: 'Candle resolution' })).toHaveText(/5m/);
  } else {
    const fiveMin = chart.getByRole('radiogroup', { name: 'Candle resolution' }).getByRole('radio', { name: '5m', exact: true });
    await fiveMin.click();
    await expect(fiveMin).toHaveAttribute('aria-checked', 'true');
  }
  await expect(canvas).toBeVisible();

  await tokenSection(page, isMobile, 'Activity');
  const details = tokenDetails(page);
  await expect(dataRows(details.getByRole('table', { name: `${token.symbol} trades` })).first()).toBeVisible();

  await details.getByRole('tab', { name: /^Holders/ }).click();
  await expect(dataRows(details.getByRole('table', { name: `${token.symbol} holders` })).first()).toBeVisible();

  await details.getByRole('tab', { name: 'Top traders' }).click();
  await expect(dataRows(details.getByRole('table', { name: `${token.symbol} top traders` })).first()).toBeVisible();
});

test('market buy then sell, with toasts and balance changes', async ({ page, guest, isMobile }) => {
  await openToken(page, token);
  await tokenSection(page, isMobile, 'Trade');
  const trade = tradePanel(page);
  const start = await readBalance(page);

  await expect(trade.getByRole('radio', { name: 'Buy' })).toHaveAttribute('aria-checked', 'true');
  await submitTrade(page, trade.getByRole('button', { name: /^Buy [\d.]+ SOL$/ }));
  await expect(toast(page, `Bought ${token.symbol}`)).toBeVisible();
  await expect.poll(() => readBalance(page)).toBeLessThan(start);
  const afterBuy = await readBalance(page);

  await trade.getByRole('radio', { name: 'Sell' }).click();
  await trade.getByRole('button', { name: '100%', exact: true }).click();
  await submitTrade(page, trade.getByRole('button', { name: 'Sell 100%', exact: true }));
  await expect(toast(page, `Sold ${token.symbol}`)).toBeVisible();
  await expect.poll(() => readBalance(page)).toBeGreaterThan(afterBuy);

  // Sold everything: the sell side has nothing left to sell.
  await expect(trade.getByText(`You don’t hold ${token.symbol} yet`)).toBeVisible();
});

test('limit order is created and cancelled', async ({ page, guest, isMobile }) => {
  await openToken(page, token);
  await tokenSection(page, isMobile, 'Trade');
  const trade = tradePanel(page);

  await trade.getByRole('tablist', { name: 'Order type' }).getByRole('tab', { name: 'Limit' }).click();
  // The trigger is prefilled below the market: a dip buy that will not fire during the test.
  await expect(trade.getByText(/Buy the dip · fires below/)).toBeVisible();
  await trade.getByRole('button', { name: /^Place limit buy/ }).click();
  await expect(toast(page, 'Buy the dip order placed')).toBeVisible();

  await tokenSection(page, isMobile, 'Activity');
  const details = tokenDetails(page);
  await details.getByRole('tab', { name: /^Orders/ }).click();
  const open = details.getByRole('table', { name: 'Open orders' });
  await expect(dataRows(open)).toHaveCount(1);
  await expect(dataRows(open).first()).toContainText('Limit');

  await open.getByRole('button', { name: 'Cancel order' }).click();
  await expect(toast(page, 'Order cancelled')).toBeVisible();
  await expect(details.getByText('No open orders')).toBeVisible();
  await details.getByRole('radiogroup', { name: 'Order status' }).getByRole('radio', { name: 'History' }).click();
  await expect(dataRows(details.getByRole('table', { name: 'Past orders' })).first()).toContainText(/cancel/i);
});

test('buying with an exit strategy creates its exit orders', async ({ page, guest, isMobile }) => {
  await openToken(page, token);
  await tokenSection(page, isMobile, 'Trade');
  const trade = tradePanel(page);

  await trade.getByRole('tablist', { name: 'Order type' }).getByRole('tab', { name: 'Auto' }).click();
  await expect(trade.getByText('Buy with exit strategy')).toBeVisible();
  const buy = trade.getByRole('button', { name: /^Buy [\d.]+ SOL\s*\+ 3 exits$/ });
  await submitTrade(page, buy);
  await expect(toast(page, `Bought ${token.symbol}`).filter({ hasText: '3 exit orders' })).toBeVisible();

  // The exits are server-side orders on this token (open unless one already fired).
  const res = await page.request.get(`/api/orders?status=open&token=${token.address}`, { headers: guest.headers });
  const hist = await page.request.get(`/api/orders?status=history&token=${token.address}`, { headers: guest.headers });
  const orders = [...((await res.json()) as Order[]), ...((await hist.json()) as Order[])].filter((o) => o.source === 'strategy');
  expect(orders.map((o) => o.kind).sort()).toEqual(['stop_loss', 'take_profit', 'take_profit']);

  await tokenSection(page, isMobile, 'Activity');
  const details = tokenDetails(page);
  await details.getByRole('tab', { name: /^Orders/ }).click();
  const open = details.getByRole('table', { name: 'Open orders' });
  await expect(dataRows(open).first()).toBeVisible();
  await expect(open.getByText(/take profit/i).first()).toBeVisible();
});
