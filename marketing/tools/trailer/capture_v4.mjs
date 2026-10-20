// Trailer v4 app takes (video/SCRIPT.md §8.2) in marketing capture mode, on the local demo market:
// one high-risk token for shots 8, 10 and 12. Paper buy only (the local simulator; no real funds or chains).
//   A: the Auto form with "Sell when dev sells 100%", the High-risk dialog (with its Exit strategy row), tick, Buy anyway, the fill toast.
//   B: a ring-buffered recording that keeps the last 30 s, stopped 3 s after the "Dev-sell exit filled" toast.
//   Stills at DPR 3: the token's Audit card and Holders strip (shot 8); DPR 2 page stills of the dialog (open, ticked) and both toasts.
//   Sell presets are set to 80% slippage first so the exit can fill in the dump.
// Usage: node capture_v4.mjs scratch_dir
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire('/home/user/Gmgn/apps/web/package.json');
const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8787';
const MODE = '/home/user/Gmgn/marketing/tools/capture-mode.js';
const APP = '/home/user/Gmgn/marketing/video/app-footage';
const STILLS = '/home/user/Gmgn/marketing/screens/live';
const TMP = process.argv[2];
const metaPath = `${STILLS}/trailer-v4.json`;
const meta = {};
const save = () => fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
const api = async (p) => (await fetch(BASE + p)).json();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLUR = 'h1.text-lg.font-bold,h1.text-lg.font-bold + *{filter:blur(6px)!important}';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function session(dpr) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, colorScheme: 'dark' });
  await ctx.addInitScript({ path: MODE });
  await ctx.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(BLUR)};document.head.appendChild(s);});`);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sol/trenches`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: /Start trading|Start paper trading|Quick start/i }).last().click();
  await page.waitForTimeout(2000);
  // Exits sell into the dev's dump: the default 25% sell slippage fails there ("slippage exceeded", seen on the first
  // take). A trader running dev-sell exits sets wide exit slippage; do the same here through the settings API.
  await page.evaluate(async () => {
    const preset = { slippage: 0.8, autoSlippage: false };
    await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${localStorage.getItem('ts.token')}` },
      body: JSON.stringify({ trade: { sol: { sellPresets: { P1: preset, P2: preset, P3: preset } } } }) });
  });
  return { ctx, page };
}
const panel = (page, title) => page.locator('section.panel').filter({ has: page.locator('h3', { hasText: new RegExp(`^${title}`) }) }).first();
const box = async (loc) => { const b = await loc.boundingBox().catch(() => null); return b && [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };

/** CDP screencast into memory; `keep` seconds of history (0 = all). */
async function screencast(page, keep = 0) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    if (keep) while (frames.length > 2 && frames[frames.length - 1].t - frames[0].t > keep) frames.shift();
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 3840, maxHeight: 2160, everyNthFrame: 1 });
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
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', `${APP}/${name}.mp4`]);
  return frames[0].t;
}

const { page } = await session(2);
const stillCtx = await session(3);
const s = (t) => t.security ?? {};

for (let attempt = 1; attempt <= 4; attempt++) {
  const tr = await api('/api/sol/trenches?limit=100');
  const now = Date.now();
  const cands = [...tr.new, ...tr.almost].filter((t) => t.status === 'curve' && now - t.createdAt > 60_000 && now - t.createdAt < 8 * 60_000
    && (s(t).rugRatio ?? 0) > 0.4 && s(t).bundlerRate >= 0.1 && s(t).insiderHoldRate >= 0.05 && s(t).devHoldRate >= 0.08 && s(t).devStatus === 'hold')
    .sort((a, b) => s(b).devHoldRate - s(a).devHoldRate);
  const t = cands[0];
  if (!t) { console.log('no candidate yet; waiting'); await sleep(20_000); continue; }
  console.log('attempt', attempt, t.symbol, 'dev', s(t).devHoldRate.toFixed(2), 'rug', s(t).rugRatio.toFixed(2));
  meta.token = { symbol: t.symbol, address: t.address, security: s(t) };

  // Shot 8 stills at DPR 3 before anything else changes.
  await stillCtx.page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await stillCtx.page.waitForTimeout(2500);
  await panel(stillCtx.page, 'Audit').screenshot({ path: `${STILLS}/v4-audit.png` });
  await panel(stillCtx.page, 'Holders').screenshot({ path: `${STILLS}/v4-holders.png` });
  meta.auditText = await panel(stillCtx.page, 'Audit').innerText();

  await page.goto(`${BASE}/sol/token/${t.address}`, { waitUntil: 'networkidle' });
  await page.locator('[aria-label="Candle resolution"]').getByText('1s', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
  await page.mouse.move(1919, 1079);
  await page.waitForTimeout(2000);
  const aside = page.locator('aside').first();

  // Take A.
  const A = await screencast(page);
  const tA = Date.now();
  const beat = (k, extra) => { meta[k] = { t: (Date.now() - tA) / 1000, ...(extra || {}) }; };
  await page.waitForTimeout(1500);
  await aside.locator('[aria-label="Order type"]').getByText('Auto', { exact: true }).click();
  await page.waitForTimeout(600);
  await aside.getByRole('button', { name: /^Clear$/ }).first().click().catch(() => {});
  const dev = aside.locator('[aria-label="Sell percent when dev sells"]').first();
  await dev.fill('100');
  await dev.press('Tab');
  await aside.getByRole('button', { name: /^0\.5$/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  const buy = aside.getByRole('button', { name: /^Buy [\d.]+ SOL/ }).first();
  beat('autoForm', { form: await box(aside) });
  const bb = await buy.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 16 });
  await page.waitForTimeout(250);
  beat('buyClick');
  await buy.click();
  await page.waitForTimeout(900);
  const dlg = page.getByRole('dialog').first();
  if (!(await dlg.count())) { console.log('no risk dialog; skipping token'); await A.stop(); continue; }
  beat('dialog', { box: await box(dlg), title: await box(dlg.getByText(/High-risk token/).first()), exitRow: await box(dlg.getByText(/^Exit strategy$/).first().locator('..')) });
  await page.screenshot({ path: `${STILLS}/v4-dialog.png` });
  const reasons = dlg.getByText(/Why this is risky/).first();
  const rb = await reasons.boundingBox();
  await page.mouse.move(rb.x + 60, rb.y + 40, { steps: 14 });
  await page.waitForTimeout(400);
  const cb = dlg.getByText('I understand the risks and want to buy');
  const cbb = await cb.boundingBox();
  await page.mouse.move(cbb.x + 10, cbb.y + cbb.height / 2, { steps: 16 });
  await page.waitForTimeout(250);
  beat('tick');
  await cb.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${STILLS}/v4-dialog-ticked.png` });
  const ba = dlg.getByRole('button', { name: 'Buy anyway' });
  const bab = await ba.boundingBox();
  await page.mouse.move(bab.x + bab.width / 2, bab.y + bab.height / 2, { steps: 14 });
  await page.waitForTimeout(300);
  beat('buyAnyway');
  await ba.click();
  await page.waitForTimeout(1600);
  const fillToast = page.locator('[role="status"], li, div').filter({ hasText: /^Bought / }).last();
  beat('fillToast', { box: await box(fillToast) });
  await page.screenshot({ path: `${STILLS}/v4-fill-toast.png` });
  await page.mouse.move(1919, 700, { steps: 10 });
  await page.waitForTimeout(1500);
  await A.stop();
  encode(A.frames, 'v4-token-a', (A.frames.at(-1)?.t ?? 0) + 0.5);
  meta.takeA = { start: A.frames[0].t };
  save();
  console.log('take A done');

  // Take B: ring buffer until the dev-sell exit fills (or the order fails), max 15 min.
  const B = await screencast(page, 30);
  const deadline = Date.now() + 15 * 60_000;
  let outcome = null;
  while (Date.now() < deadline && !outcome) {
    const ok = page.getByText(/Dev-sell exit filled/).first();
    const bad = page.getByText(/Dev-sell exit failed/).first();
    if (await ok.count()) outcome = 'filled';
    else if (await bad.count()) outcome = 'failed';
    else await sleep(250);
  }
  if (outcome) {
    const toast = page.getByText(/Dev-sell exit (filled|failed)/).first();
    meta.exitToast = { outcome, at: Date.now() / 1000, box: await box(toast) };
    await page.screenshot({ path: `${STILLS}/v4-exit-toast.png` });
  }
  await page.waitForTimeout(3000);
  await B.stop();
  if (!outcome) { console.log('no dev sell within 15 min; next token'); continue; }
  const devSells = (await api(`/api/sol/signals?kind=dev_sell&limit=50`)).filter((x) => x.token?.address === t.address);
  meta.devSell = devSells.map((x) => ({ title: x.title, createdAt: x.createdAt }));
  meta.takeB = { start: encode(B.frames, 'v4-token-b', B.frames.at(-1).t + 0.5), end: B.frames.at(-1).t };
  save();
  console.log('take B done', outcome, JSON.stringify(meta.devSell));
  if (outcome === 'filled') break;
}
await browser.close();
