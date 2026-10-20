// Shared fixtures for the end-to-end suite.
//
// - Every test fails on an uncaught page exception (console errors are
//   collected too; the smoke spec asserts there are none).
// - External font requests are answered locally so runs never depend on the
//   network.
// - `guest` creates a fresh paper account through the API and signs the page
//   in before any app script runs (each test gets its own account, so tests
//   never share balances, orders or follows).

import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Account, AuthResponse } from '@trenchscope/shared';

export interface Guest {
  token: string;
  account: Account;
  /** Authorization header for API calls made as this account. */
  headers: Record<string, string>;
}

export interface PageIssues {
  consoleErrors: string[];
  pageErrors: string[];
}

interface Fixtures {
  issues: PageIssues;
  guest: Guest;
}

export async function createGuest(request: APIRequestContext): Promise<Guest> {
  const res = await request.post('/api/auth/guest', { data: {} });
  expect(res.ok(), `guest account: ${res.status()} ${await res.text()}`).toBeTruthy();
  const auth = (await res.json()) as AuthResponse;
  return { token: auth.token, account: auth.account, headers: { authorization: `Bearer ${auth.token}` } };
}

/** Sign `page` in as `guest` on every (re)load, before the app boots. */
export async function signIn(page: Page, guest: Guest): Promise<void> {
  await page.addInitScript((token) => {
    try {
      localStorage.setItem('ts.token', token);
    } catch {
      /* storage unavailable */
    }
  }, guest.token);
}

export const test = base.extend<Fixtures>({
  context: async ({ context }, use) => {
    // Google Fonts: an empty stylesheet keeps runs offline-safe (the app falls back to system fonts).
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
      route.fulfill({ status: 200, contentType: route.request().url().includes('googleapis') ? 'text/css' : 'font/woff2', body: '' }),
    );
    await use(context);
  },

  issues: [
    async ({ page }, use, testInfo) => {
      const issues: PageIssues = { consoleErrors: [], pageErrors: [] };
      page.on('console', (msg) => {
        if (msg.type() === 'error') issues.consoleErrors.push(`${msg.text()} (${msg.location().url || 'n/a'})`);
      });
      page.on('pageerror', (err) => issues.pageErrors.push(`${err.name}: ${err.message}`));
      await use(issues);
      if (issues.consoleErrors.length) await testInfo.attach('console-errors', { body: issues.consoleErrors.join('\n'), contentType: 'text/plain' });
      expect(issues.pageErrors, 'uncaught exceptions in the page').toEqual([]);
    },
    { auto: true },
  ],

  guest: async ({ page, request }, use) => {
    const guest = await createGuest(request);
    await signIn(page, guest);
    await use(guest);
  },
});

export { expect };
