// Captures real Trenchscope screens (stills at 2x) and smooth screen recordings
// (CDP screencast frames -> ffmpeg CFR mp4) for the marketing kit.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const OUT = '/home/user/Gmgn/marketing';
const SHOTS = `${OUT}/screens`;
const CLIPS = `${OUT}/video/app-footage`;
const TMP = process.argv[2] || '/tmp/cap-frames';
const only = process.argv[3] ? process.argv[3].split(',') : null;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(CLIPS, { recursive: true });

const api = async (p) => (await fetch(BASE + p)).json();

// ---- pick interesting real tokens/wallets from the live sim ----
const trenches = await api('/api/sol/trenches?limit=100');
const risk = (t) => (t.security?.bundlerRate ?? 0) + (t.security?.sniperHoldRate ?? 0) + (t.security?.insiderHoldRate ?? 0) + (t.security?.devHoldRate ?? 0);
const almost = [...trenches.almost].sort((a, b) => (b.stats?.['5m']?.txs ?? 0) - (a.stats?.['5m']?.txs ?? 0));
const riskyToken = [...trenches.almost, ...trenches.new].sort((a, b) => risk(b) - risk(a))[0];
const trending = await api('/api/sol/trending?window=1h&sort=volume&limit=10');
const bigToken = trending.tokens[0];
const board = await api('/api/sol/leaderboard?tag=smart&period=1d&sort=pnl&limit=5');
const smartWallet = board[0];
console.log('picked', { risky: riskyToken?.symbol, big: bigToken?.symbol, almost: almost[0]?.symbol, wallet: smartWallet?.address });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function newPage(dpr) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'dark' });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function signIn(page) {
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Start paper trading|Quick start|Create guest/i }).last().click().catch(async () => {
    // Fallback: the primary button in the dialog.
    await page.locator('[role=dialog] button').filter({ hasText: /start/i }).last().click();
  });
  await page.waitForTimeout(1500);
}

async function still(page, name, url, { wait = 3500, before } = {}) {
  if (only && !only.includes(name)) return;
  if (url) await page.goto(BASE + url, { waitUntil: 'networkidle' });
  if (before) await before(page);
  await page.waitForTimeout(wait);
  await page.mouse.move(1900, 1070);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log('still', name);
}

// CDP screencast: frames arrive on visual change with a timestamp; we hold
// each frame until the next one, then encode a constant-30fps H.264 clip.
async function clip(page, name, url, seconds, actions) {
  if (only && !only.includes(name)) return;
  if (url) await page.goto(BASE + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const start = Date.now();
  if (actions) await actions(page);
  const left = seconds * 1000 - (Date.now() - start);
  if (left > 0) await page.waitForTimeout(left);
  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(200);
  if (!frames.length) throw new Error('no frames for ' + name);
  const t0 = frames[0].t;
  const list = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = i + 1 < frames.length ? frames[i + 1].t : t0 + seconds;
    list.push(`file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-t', String(seconds), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow',
    `${CLIPS}/${name}.mp4`]);
  console.log('clip', name, frames.length, 'frames');
}

const smoothScroll = async (page, selector, dy, ms) => {
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(16);
  }
};

// ---------- stills (2x) ----------
{
  const { ctx, page } = await newPage(2);
  await signIn(page);
  await still(page, 'screen-trenches', '/sol/trenches');
  await still(page, 'screen-trending', '/sol/trending');
  await still(page, 'screen-new-pairs', '/sol/new-pairs');
  await still(page, 'screen-narratives', '/sol/narratives');
  await still(page, 'screen-token', `/sol/token/${bigToken.address}`, { wait: 5000 });
  await still(page, 'screen-token-audit', `/sol/token/${riskyToken.address}`, { wait: 5000 });
  await still(page, 'screen-token-holders', `/sol/token/${riskyToken.address}`, {
    wait: 3000,
    before: async (p) => {
      await p.waitForTimeout(2500);
      await p.getByRole('tab', { name: /^Holders/ }).first().click().catch(() => p.getByText(/^Holders$/).first().click());
    },
  });
  await still(page, 'screen-wallet', `/sol/address/${smartWallet.address}`, { wait: 4000 });
  await still(page, 'screen-leaderboard', '/sol/leaderboard');
  await still(page, 'screen-monitor', '/sol/monitor', { wait: 6000 });
  await still(page, 'screen-signals', '/sol/signals', { wait: 5000 });
  await still(page, 'screen-copytrade', '/sol/copytrade');
  await still(page, 'screen-sniper', '/sol/sniper');
  await still(page, 'screen-portfolio', '/portfolio');
  await still(page, 'screen-trenches-base', '/base/trenches');
  await still(page, 'screen-trenches-bsc', '/bsc/trenches');
  await ctx.close();
}

// ---------- clips (1x, 1920x1080) ----------
{
  const { ctx, page } = await newPage(1);
  await signIn(page);
  await clip(page, 'app-trenches-live', '/sol/trenches', 10);
  await clip(page, 'app-token-chart', `/sol/token/${bigToken.address}`, 8, async (p) => {
    await p.waitForTimeout(2500);
    await p.mouse.move(700, 450, { steps: 40 });
    await p.mouse.move(1100, 420, { steps: 60 });
  });
  await clip(page, 'app-token-audit', `/sol/token/${riskyToken.address}`, 8, async (p) => {
    await p.waitForTimeout(1500);
    await p.mouse.move(1500, 500, { steps: 30 });
    await smoothScroll(p, null, 700, 2500);
  });
  await clip(page, 'app-monitor-feed', '/sol/monitor', 8);
  await clip(page, 'app-signals', '/sol/signals', 7);
  await clip(page, 'app-wallet', `/sol/address/${smartWallet.address}`, 7, async (p) => {
    await p.waitForTimeout(2000);
    await smoothScroll(p, null, 500, 2500);
  });
  await clip(page, 'app-leaderboard', '/sol/leaderboard', 6);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${SHOTS}/picks.json`, JSON.stringify({ riskyToken: riskyToken.address, bigToken: bigToken.address, smartWallet: smartWallet.address }, null, 1));
