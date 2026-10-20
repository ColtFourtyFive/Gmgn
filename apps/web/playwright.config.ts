// Playwright end-to-end suite: the real API (simulator + paper trading) serving
// the built web app on one port. `npm run e2e` builds apps/web/dist first; the
// web server below only starts the API.

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, defineConfig, devices } from '@playwright/test';

const PORT = 8799;
const BASE_URL = `http://localhost:${PORT}`;
const WEB_DIST = fileURLToPath(new URL('./dist', import.meta.url));
const SERVER_DIR = fileURLToPath(new URL('../server', import.meta.url));

/**
 * Chromium binary to launch. Normally Playwright's own build; when that exact
 * revision is not installed (offline images ship whatever build they have),
 * fall back to any chromium in PLAYWRIGHT_BROWSERS_PATH instead of downloading.
 */
function chromiumExecutable(): string | undefined {
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    /* no registry entry: look for a fallback */
  }
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const builds = readdirSync(root)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const dir of builds) {
    const bin = join(root, dir, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

const executablePath = chromiumExecutable();
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        launchOptions,
      },
    },
  ],
  webServer: {
    // Run from apps/server so `--import tsx` resolves its tsx dependency.
    command: 'node --import tsx src/index.ts',
    cwd: SERVER_DIR,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      WARMUP_MINUTES: '20',
      SNAPSHOT_EVERY_MS: '0',
      TRADE_LATENCY_MS: '0',
      WEB_DIST,
      ACCOUNT_CREATIONS_PER_IP: '1000',
    },
  },
});
