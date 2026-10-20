// Accessibility: axe-core (WCAG 2.1 A/AA rules) on the main surfaces, failing
// on critical or serious violations. Skipped when @axe-core/playwright is not
// installed.

import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { CHAIN, dataRows, openToken, parkPointer, pickTradableToken, tokenSection } from './helpers';

const require = createRequire(import.meta.url);

function axeInstalled(): boolean {
  try {
    require.resolve('@axe-core/playwright');
    return true;
  } catch {
    return false;
  }
}

const HAS_AXE = axeInstalled();

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  const report = serious.map((v) => `[${v.impact}] ${v.id}: ${v.help}\n${v.nodes.slice(0, 5).map((n) => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(1, 2).join(' ').trim()}`).join('\n')}`);
  expect(report, 'critical/serious accessibility violations').toEqual([]);
}

test.describe('accessibility', () => {
  test.skip(!HAS_AXE, '@axe-core/playwright is not installed (add it to apps/web devDependencies to run the accessibility checks)');

  test('trenches', async ({ page, guest }) => {
    await page.goto(`/${CHAIN}/trenches`);
    await parkPointer(page);
    await expect(page.getByRole('list', { name: 'New tokens' }).getByRole('listitem').first()).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('token page', async ({ page, request, guest, isMobile }) => {
    const token = await pickTradableToken(request);
    await openToken(page, token);
    await expect(page.getByRole('region', { name: `${token.symbol} chart` }).locator('canvas').first()).toBeVisible();
    if (!isMobile) await expect(dataRows(page.getByRole('table', { name: `${token.symbol} trades` })).first()).toBeVisible();
    await expectNoSeriousViolations(page);
    if (isMobile) {
      // Phones split the page into sections: check the trade panel and the activity tabs too.
      await tokenSection(page, isMobile, 'Trade');
      await expect(page.getByRole('region', { name: 'Trade' })).toBeVisible();
      await expectNoSeriousViolations(page);
      await tokenSection(page, isMobile, 'Activity');
      await expect(dataRows(page.getByRole('table', { name: `${token.symbol} trades` })).first()).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  test('portfolio', async ({ page, guest }) => {
    await page.goto('/portfolio');
    await expect(page.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeVisible();
    await expect(page.getByRole('main').locator('.skeleton')).toHaveCount(0);
    await expectNoSeriousViolations(page);
  });

  test('settings', async ({ page, guest }) => {
    await page.goto('/settings');
    await expect(page.getByLabel('P2 buy slippage')).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('command palette and search dropdown', async ({ page, isMobile }) => {
    await page.goto(`/${CHAIN}/trending`);
    await expect(page.getByRole('heading', { level: 1, name: 'Trending' })).toBeVisible();
    const openPalette = async () => {
      if (isMobile) await page.getByRole('banner').getByRole('button', { name: /^Command palette/ }).click();
      else await page.keyboard.press('Control+K');
      const dialog = page.getByRole('dialog', { name: 'Command palette' });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    // A recent pick adds the Recent group (and its Clear button).
    let palette = await openPalette();
    await palette.getByRole('combobox').fill('portfolio');
    await palette.getByRole('combobox').press('Enter');
    await expect(page).toHaveURL('/portfolio');
    palette = await openPalette();
    await expect(palette.getByRole('group', { name: 'Recent' })).toBeVisible();
    await expectNoSeriousViolations(page);
    // A query long enough to overflow the results.
    await palette.getByRole('combobox').fill('a');
    await expect(palette.getByRole('option').nth(8)).toBeAttached();
    await expectNoSeriousViolations(page);
    await page.keyboard.press('Escape');

    if (!isMobile) {
      const search = page.getByRole('banner').getByRole('combobox', { name: 'Search tokens and wallets' });
      await search.fill('a');
      await expect(page.getByRole('listbox', { name: 'Search results' }).getByRole('option').first()).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  // The guest fixture's account defaults to the dark theme (and the app applies
  // the account's theme), so the light theme needs its own pass.
  test.describe('light theme', () => {
    test.beforeEach(async ({ page, request, guest }) => {
      const res = await request.put('/api/settings', { headers: guest.headers, data: { display: { theme: 'light' } } });
      expect(res.ok(), `save theme: ${res.status()}`).toBeTruthy();
      await page.goto('/portfolio');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('trenches', async ({ page }) => {
      await page.goto(`/${CHAIN}/trenches`);
      await parkPointer(page);
      await expect(page.getByRole('list', { name: 'New tokens' }).getByRole('listitem').first()).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('trending', async ({ page }) => {
      await page.goto(`/${CHAIN}/trending`);
      await expect(page.getByRole('heading', { level: 1, name: 'Trending' })).toBeVisible();
      await expect(dataRows(page.getByRole('main').getByRole('table')).first()).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('token page', async ({ page, request }) => {
      const token = await pickTradableToken(request);
      await openToken(page, token);
      await expect(page.getByRole('region', { name: `${token.symbol} chart` }).locator('canvas').first()).toBeVisible();
      await expectNoSeriousViolations(page);
    });

    test('settings', async ({ page }) => {
      await page.goto('/settings');
      await expect(page.getByLabel('P2 buy slippage')).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  });
});

// Layout-dependent keyboard and display-mode checks (no axe needed).
test.describe('focus visibility and forced colors', () => {
  test('focus is never hidden under a sticky bottom bar (WCAG 2.4.11)', async ({ page, guest }) => {
    await page.goto('/settings');
    const field = page.getByLabel('P2 buy slippage');
    await field.fill('17');
    await expect(page.getByRole('region', { name: 'Unsaved changes' })).toBeVisible();
    const hidden: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const covered = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const bar = document.querySelector('[data-sticky-bottom]');
        if (!el || el === document.body || !bar || bar.contains(el)) return null;
        const e = el.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(e.bottom, b.bottom) - Math.max(e.top, b.top));
        return { name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? el.tagName, share: e.height ? overlap / e.height : 0 };
      });
      if (covered && covered.share > 0.05) hidden.push(`${covered.name} (${Math.round(covered.share * 100)}%)`);
    }
    expect(hidden, 'focused controls under the Unsaved changes bar').toEqual([]);
  });

  test('top bar focus rings are not clipped', async ({ page, guest, isMobile }) => {
    test.skip(isMobile, 'the desktop top bar');
    await page.goto(`/${CHAIN}/trending`);
    await expect(page.getByRole('heading', { level: 1, name: 'Trending' })).toBeVisible();
    const clipped: string[] = [];
    let checked = 0;
    await page.locator('body').focus();
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const res = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.closest('#root header')) return null;
        const cs = getComputedStyle(el);
        // The outline's outer edge, outside the border box by offset + width when positive.
        const grow = Math.max(0, (parseFloat(cs.outlineWidth) || 0) + (parseFloat(cs.outlineOffset) || 0));
        const r = el.getBoundingClientRect();
        const box = { l: r.left - grow, t: r.top - grow, r: r.right + grow, b: r.bottom + grow };
        for (let a = el.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
          const ar = a.getBoundingClientRect();
          const l = ar.left + a.clientLeft;
          const t = ar.top + a.clientTop;
          // 1px of slack for sub-pixel layout (clientWidth is rounded).
          if (box.l < l - 1 || box.t < t - 1 || box.r > l + a.clientWidth + 1 || box.b > t + a.clientHeight + 1) return el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
        }
        return '';
      });
      if (res === null) continue;
      checked++;
      if (res) clipped.push(res);
    }
    expect(checked, 'header controls reached with Tab').toBeGreaterThan(8);
    expect(clipped, 'header controls whose focus ring is cut off').toEqual([]);
  });

  test('forced colors keep checked and selected states visible', async ({ page, guest }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Display' }).click();
    const on = page.getByRole('switch', { checked: true }).first();
    const off = page.getByRole('switch', { checked: false }).first();
    await expect(on).toBeVisible();
    const look = (s: typeof on) => s.evaluate((el) => `${getComputedStyle(el).backgroundColor}/${getComputedStyle(el.firstElementChild!).backgroundColor}`);
    const [lookOn, lookOff] = [await look(on), await look(off)];
    expect(lookOn, 'checked and unchecked switches render alike').not.toBe(lookOff);
    // The thumb is drawn, not a background-only dot the mode erases.
    expect(lookOff.split('/')[0]).not.toBe(lookOff.split('/')[1]);

    const selected = page.getByRole('radio', { checked: true }).first();
    const other = page.getByRole('radio', { checked: false }).first();
    await expect(selected).toHaveCSS('outline-style', 'solid');
    await expect(other).toHaveCSS('outline-style', 'none');
  });
});
