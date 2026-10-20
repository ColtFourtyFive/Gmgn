// Trailer v4 vertical (9:16) app takes on the phone layout, in marketing capture mode on the local demo market.
// The page is 432x768 CSS at a forced device scale of 2.5, so the CDP screencast is native 1080x1920 (Playwright's
// own DPR emulation screencasts at CSS size). Same story as capture_v4.mjs, on one high-risk demo token; the buy is a
// paper buy in the local simulator (no real funds or chains).
//   board: the Trenches list with a slow scroll
//   info:  the token's Info tab, scrolling from the Audit card to the holder chips
//   A:     Trade tab, Auto, "Sell when dev sells 100%", Buy, the High-risk dialog, tick, Buy anyway, the fill toast
//   B:     Chart tab, ring-buffered (last 30 s), stopped 3 s after the "Dev-sell exit filled" toast
// Tap positions (CSS px) and beat times go to screens/live/trailer-v4m.json for the tap marks in the edit.
// Usage: node capture_v4m.mjs scratch_dir
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const MODE = '/home/user/Gmgn/marketing/tools/capture-mode.js';
const APP = '/home/user/Gmgn/marketing/video/app-footage';
const TMP = process.argv[2];
const metaPath = '/home/user/Gmgn/marketing/screens/live/trailer-v4m.json';
const meta = {};
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const api = async (p) => (await fetch(BASE + p)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLUR = 'a.link.font-semibold[title],span.truncate.text-muted[title],h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--force-device-scale-factor=2.5', '--window-size=432,768'] });
const ctx = await browser.newContext({ viewport: null, colorScheme: 'dark' });
await ctx.addInitScript({ path: MODE });
await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR)};document.head.appendChild(s);});`);
const page = await ctx.newPage();
const em = await ctx.newCDPSession(page);
await em.send('Emulation.setDeviceMetricsOverride', { width: 432, height: 768, deviceScaleFactor: 0, mobile: true });
await em.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Sign in' }).first().click();
await page.getByRole('button', { name: /Start trading|Start paper trading|Quick start/i }).last().click();
await page.waitForTimeout(2000);
// Wide exit slippage, as in capture_v4.mjs: the default 25% fails in the dev's dump.
await page.evaluate(async () => {
  const preset = { slippage: 0.8, autoSlippage: false };
  await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ts.token')}` },
    body: JSON.stringify({ trade: { sol: { sellPresets: { P1: preset, P2: preset, P3: preset } } } }) });
});

const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };

async function screencast(keep = 0) {
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    if (keep) while (frames.length > 2 && frames[frames.length - 1].t - frames[0].t > keep) frames.shift();
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  return { frames, stop: async () => { await cdp.send('Page.stopScreencast'); await sleep(200); } };
}
function encode(frames, name, tEnd) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const list = [];
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
    list.push(`file '${file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), list.join('\n'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', `${APP}/${name}.mp4`]);
  return frames[0].t;
}
/** Smooth touch-like scroll of `dy` CSS px over `ms`. */
async function glide(dy, ms) {
  await page.mouse.move(216, 420);
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await sleep(16); }
}
async function record(name, fn) {
  const R = await screencast();
  const t0 = Date.now();
  const beats = {};
  const mark = (k, extra) => { beats[k] = { t: (Date.now() - t0) / 1000, ...(extra || {}) }; };
  await fn(mark);
  await R.stop();
  encode(R.frames, name, R.frames.at(-1).t + 0.3);
  meta[name] = beats;
  save();
  console.log('take', name, Object.keys(beats).join(','));
}
const tap = async (mark, k, loc) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await box(loc);
  mark(k, { tap: b && [b[0] + b[2] / 2, b[1] + b[3] / 2] });
  await loc.click();
};

// Board.
await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
await page.mouse.move(431, 767);
await page.waitForTimeout(2500);
await record('v4m-board', async () => { await sleep(1200); await glide(260, 1600); await sleep(800); });

const s = (t) => t.security ?? {};
for (let attempt = 1; attempt <= 6; attempt++) {
  const tr = await api('/api/sol/trenches?limit=100');
  const now = Date.now();
  const t = [...tr.new, ...tr.almost].filter((x) => x.status === 'curve' && now - x.createdAt > 60_000 && now - x.createdAt < 8 * 60_000
    && (s(x).rugRatio ?? 0) > 0.4 && s(x).bundlerRate >= 0.1 && s(x).insiderHoldRate >= 0.05 && s(x).devHoldRate >= 0.08 && s(x).devStatus === 'hold')
    .sort((a, b) => s(b).devHoldRate - s(a).devHoldRate)[0];
  if (!t) { console.log('no candidate yet; waiting'); await sleep(20_000); continue; }
  console.log('attempt', attempt, t.symbol, 'dev', s(t).devHoldRate.toFixed(2), 'rug', s(t).rugRatio.toFixed(2));
  meta.token = { symbol: t.symbol, address: t.address, security: s(t) };
  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Receipts: Info tab, Audit card then the holder chips.
  await page.getByRole('tab', { name: 'Info' }).first().click();
  await page.waitForTimeout(1200);
  await record('v4m-info', async (mark) => {
    mark('audit', { panel: await box(page.locator('section.panel').filter({ has: page.locator('h3', { hasText: /^Audit/ }) }).first()) });
    await sleep(1600);
    const holders = page.locator('section.panel').filter({ has: page.locator('h3', { hasText: /^Holders/ }) }).first();
    const hb = await holders.boundingBox();
    await glide(Math.max(0, hb.y - 70), 900);
    await sleep(300);
    mark('holders', { panel: await box(holders) });
    await sleep(1400);
  });

  // Take A on the Trade tab.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('tab', { name: 'Chart' }).first().click();
  await page.getByText('1s', { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
  await page.getByRole('tab', { name: 'Trade' }).first().click();
  await page.waitForTimeout(1000);
  let dialogSeen = false;
  await record('v4m-token-a', async (mark) => {
    await sleep(700);
    await tap(mark, 'auto', page.locator('[aria-label="Order type"]').getByText('Auto', { exact: true }).first());
    await sleep(500);
    await page.getByRole('button', { name: /^Clear$/ }).first().click().catch(() => {});
    await page.getByRole('button', { name: /^0\.5$/ }).first().click().catch(() => {});
    const dev = page.locator('[aria-label="Sell percent when dev sells"]').first();
    await dev.scrollIntoViewIfNeeded();
    const db = await box(dev);
    await glide(Math.max(0, db[1] - 330), 600);
    await sleep(200);
    const b2 = await box(dev);
    mark('dev', { tap: [b2[0] + b2[2] / 2, b2[1] + b2[3] / 2] });
    await dev.fill('100');
    await dev.press('Tab');
    await sleep(900);
    const buy = page.getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first();
    await tap(mark, 'buy', buy);
    await sleep(900);
    const dlg = page.getByRole('dialog').first();
    if (!(await dlg.count())) return;
    dialogSeen = true;
    mark('dialog', { box: await box(dlg) });
    await sleep(2200);
    await tap(mark, 'tick', dlg.getByText('I understand the risks and want to buy'));
    await sleep(700);
    await tap(mark, 'anyway', dlg.getByRole('button', { name: 'Buy anyway' }));
    await page.getByText(/^Bought /).first().waitFor({ timeout: 5000 }).catch(() => {});
    mark('fill', { box: await box(page.getByText(/^Bought /).first().locator('xpath=ancestor::*[@role="status" or contains(@class,"toast")][1]')) });
    await sleep(2200);
  });
  if (!dialogSeen) { console.log('no risk dialog; next token'); continue; }

  // Take B on the Chart tab.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('tab', { name: 'Chart' }).first().click();
  await page.waitForTimeout(800);
  const B = await screencast(30);
  const deadline = Date.now() + 15 * 60_000;
  let outcome = null;
  while (Date.now() < deadline && !outcome) {
    if (await page.getByText(/Dev-sell exit filled/).count()) outcome = 'filled';
    else if (await page.getByText(/Dev-sell exit failed/).count()) outcome = 'failed';
    else await sleep(250);
  }
  if (outcome) meta.exitToast = { outcome, at: Date.now() / 1000, box: await box(page.getByText(/Dev-sell exit (filled|failed)/).first()) };
  await page.waitForTimeout(3000);
  await B.stop();
  if (!outcome) { console.log('no dev sell within 15 min; next token'); continue; }
  const devSells = (await api('/api/sol/signals?kind=dev_sell&limit=50')).filter((x) => x.token?.address === t.address);
  meta.devSell = devSells.map((x) => ({ title: x.title, createdAt: x.createdAt }));
  meta.takeB = { start: encode(B.frames, 'v4m-token-b', B.frames.at(-1).t + 0.3), end: B.frames.at(-1).t };
  save();
  console.log('take B done', outcome, JSON.stringify(meta.devSell));
  if (outcome === 'filled') break;
}
await browser.close();
